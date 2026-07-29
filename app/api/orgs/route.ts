import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getMemberByUserId,
  createOrganizationWithOwner,
  updateOrganization,
  deleteOrganization,
} from "@/lib/db/organizations";
import { apiErrorResponse, ApiError, requireMember, requireWritableMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getOrganizationById } from "@/lib/db/organizations";
import { removeObjectsByUrl } from "@/lib/uploads";
import { safeUrlSchema } from "@/lib/url-validation";
import { recordMemberAction } from "@/lib/db/auditLog";
import { recordLegalAcceptance } from "@/lib/db/legalAcceptances";
import { countWorkspaceContents, recordWorkspaceDeletion } from "@/lib/db/deletedWorkspaces";
import { getSubscriptionForOrg } from "@/lib/db/subscriptions";

const createOrgSchema = z.object({
  name: z.string().min(2).max(200),
  shortName: z.string().max(80).optional(),
  ssmNumber: z.string().max(80).optional(),
  cidbNumber: z.string().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postcode: z.string().max(20).optional(),
  ownerName: z.string().min(1).max(120),
  // Server-side, so a client that skips the checkbox cannot create a
  // workspace by calling the API directly. `literal(true)` rather than
  // `boolean()`: false has to be rejected, not merely recorded.
  acceptedTerms: z.literal(true, { message: "You must accept the terms of service and privacy notice" }),
});

/** Creates a company workspace for the signed-in user and makes them Owner. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      throw new ApiError(401, "Not signed in");
    }

    const existing = await getMemberByUserId(user.id);
    if (existing) {
      throw new ApiError(409, "This account already belongs to a company workspace");
    }

    const body = createOrgSchema.parse(await request.json());

    const { org } = await createOrganizationWithOwner({
      name: body.name,
      shortName: body.shortName,
      ssmNumber: body.ssmNumber,
      cidbNumber: body.cidbNumber,
      email: body.email,
      phone: body.phone,
      addressLine1: body.addressLine1,
      city: body.city,
      state: body.state,
      postcode: body.postcode,
      ownerUserId: user.id,
      ownerEmail: user.email!,
      ownerName: body.ownerName,
    });

    // After the org exists, because the record is scoped to it, which leaves
    // a window: if this insert fails the workspace is already created, the
    // request 500s, and a retry hits the 409 above rather than recording the
    // acceptance. Postgres has no cross-statement transaction available
    // through PostgREST here, so the window is real rather than papered
    // over. It is one idempotent insert against a table with no foreign keys
    // and no triggers, so the odds are low — but "low" is not "none", and
    // pretending otherwise in a comment would be worse than saying it.
    await recordLegalAcceptance({ orgId: org.id, userId: user.id, email: user.email! });

    return NextResponse.json({ org }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

const updateOrgSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  shortName: z.string().max(80).nullable().optional(),
  ssmNumber: z.string().max(80).nullable().optional(),
  cidbNumber: z.string().max(80).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),
  country: z.string().max(60).optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  // Same scheme restriction as document/photo URLs — the logo is rendered
  // as <img src> in the app shell on every page, so an unvalidated value
  // here would be an injection point (and a plain http:// one would leak a
  // hit to a third party on every page view).
  logoUrl: safeUrlSchema.nullable().optional(),
});

/** Updates the signed-in member's company profile (Company Settings page). */
export async function PATCH(request: Request) {
  try {
    const member = await requireWritableMember("manageOrg");
    const body = updateOrgSchema.parse(await request.json());

    // Replacing (or clearing) the logo orphans the previous one, since
    // nothing else ever references it.
    const previousLogoUrl =
      body.logoUrl !== undefined ? (await getOrganizationById(member.orgId))?.logoUrl : undefined;

    const org = await updateOrganization(member.orgId, body);

    if (previousLogoUrl && previousLogoUrl !== org.logoUrl) {
      await removeObjectsByUrl(member.orgId, [previousLogoUrl]);
    }

    const changedFields = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);
    if (changedFields.length > 0) {
      await recordMemberAction(member, {
        action: "ORG_SETTINGS_CHANGED",
        entityType: "organization",
        entityId: member.orgId,
        summary: `${member.name} changed company settings (${changedFields.join(", ")})`,
        metadata: { fields: changedFields },
      });
    }
    return NextResponse.json({ org });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

const deleteSchema = z.object({
  /** The company's exact name, typed by the user, as the confirmation. */
  confirmName: z.string().min(1),
});

/**
 * Permanently deletes the caller's company workspace.
 *
 * Owner-only and irreversible: this destroys every project, report, photo
 * and record the company has. `manageOrg` is not enough — an Admin can run
 * the workspace day to day without being able to end it.
 *
 * Sign-in accounts survive (see deleteOrganization) so no Owner can delete a
 * colleague's login.
 */
export async function DELETE(request: Request) {
  try {
    // requireMember, not requireWritableMember: someone whose trial lapsed
    // must still be able to close their account rather than being trapped by
    // read-only mode.
    const member = await requireMember();
    if (member.role !== "OWNER") {
      throw new ApiError(403, "Only the Owner can delete the company workspace");
    }

    const body = deleteSchema.parse(await request.json());
    const org = await getOrganizationById(member.orgId);
    if (!org) throw new ApiError(404, "Company not found");

    // Typing the name is the guard against a mis-click on something with no
    // undo. Compared leniently on case and surrounding space only.
    if (body.confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
      throw new ApiError(400, "The name you typed does not match the company name");
    }

    // Everything below happens before deleteOrganization, and the ordering
    // is the point. audit_log is org-scoped and cascades with the
    // organization, so the one event it can never hold is the organization's
    // own deletion. deleted_workspaces is written first: a record describing
    // a workspace that turns out to still exist is a discrepancy someone can
    // notice, whereas a workspace that is gone with no record of who removed
    // it is unrecoverable.
    const contents = await countWorkspaceContents(member.orgId);
    const subscription = await getSubscriptionForOrg(member.orgId).catch(() => null);

    await recordWorkspaceDeletion({
      orgId: member.orgId,
      orgName: org.name,
      deletedByUserId: member.userId,
      deletedByEmail: member.email,
      deletedByName: member.name,
      plan: subscription?.plan ?? null,
      contents,
    });

    logger.warn("Company workspace deleted", {
      orgId: member.orgId,
      orgName: org.name,
      byMemberId: member.id,
      ...contents,
    });

    await deleteOrganization(member.orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
