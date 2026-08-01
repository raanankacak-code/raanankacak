import { NextResponse } from "next/server";
import { z } from "zod";
import { listInvitesForOrgViaSession, createInvite } from "@/lib/db/team";
import { notify } from "@/lib/db/notifications";
import { getOrganizationById } from "@/lib/db/organizations";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { sendEmail, inviteEmailHtml, clientInviteEmailHtml } from "@/lib/email";
import { appOrigin } from "@/lib/appOrigin";
import { checkRateLimit } from "@/lib/rateLimit";
import { recordMemberAction } from "@/lib/db/auditLog";
import { assertCanAddTeamAccount } from "@/lib/billing/limits";
import { listProjectIdsInOrg, listProjectNamesByIds } from "@/lib/db/projects";

const ROLES = [
  "OWNER",
  "ADMIN",
  "PROJECT_MANAGER",
  "SITE_SUPERVISOR",
  "ENGINEER",
  "QUANTITY_SURVEYOR",
  "SAFETY_OFFICER",
  "STOREKEEPER",
  "FINANCE",
  "VIEWER",
  "CLIENT",
] as const;

const inviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(ROLES),
  phone: z.string().max(40).optional(),
  department: z.string().max(80).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
});

export async function GET() {
  try {
    const member = await requireMember("manageUsers");
    const invites = await listInvitesForOrgViaSession(member.orgId);
    return NextResponse.json({ invites });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("manageUsers");
    await assertCanAddTeamAccount(member.orgId);
    // Sending an invite triggers a real email — cap how many one account can
    // fire off in a short window so a compromised/malicious account can't
    // use this as a bulk mail relay or burn through the email provider quota.
    const rateLimit = await checkRateLimit(`invite-create:${member.id}`, 20, 60_000);
    if (!rateLimit.allowed) {
      throw new ApiError(429, "Too many invites sent. Try again shortly.");
    }
    const body = inviteSchema.parse(await request.json());
    if (body.role === "OWNER" && member.role !== "OWNER") {
      return NextResponse.json({ error: "Only the Owner can invite another Owner" }, { status: 403 });
    }
    // A client account exists to see particular projects. Inviting one with
    // no projects would create a login that can see nothing at all, and the
    // person on the other end would reasonably conclude the app is broken.
    if (body.role === "CLIENT") {
      if (!body.projectIds?.length) {
        return NextResponse.json({ error: "Choose at least one project for this client" }, { status: 400 });
      }
      const owned = await listProjectIdsInOrg(member.orgId, body.projectIds);
      if (owned.length !== body.projectIds.length) {
        // One of the ids is not this workspace's. Refuse rather than silently
        // granting the subset that is.
        return NextResponse.json({ error: "Unknown project" }, { status: 400 });
      }
    } else if (body.projectIds?.length) {
      // Staff are scoped by org, not by project. Accepting the field for them
      // would imply a restriction that nothing enforces.
      return NextResponse.json({ error: "Only a client invitation can be limited to projects" }, { status: 400 });
    }
    const invite = await createInvite(member.orgId, { ...body, invitedByName: member.name });
    await notify(member.orgId, "invite", "User Invited", `${body.email} invited as ${ROLE_LABELS[body.role]} by ${member.name}.`);
    await recordMemberAction(member, {
      action: "MEMBER_INVITED",
      entityType: "org_invite",
      entityId: invite.id,
      summary:
        body.role === "CLIENT"
          ? `${member.name} invited ${body.email} as a Client on ${body.projectIds!.length} project${body.projectIds!.length === 1 ? "" : "s"}`
          : `${member.name} invited ${body.email} as ${ROLE_LABELS[body.role]}`,
      // Which projects, for a client: giving someone outside the company
      // sight of a job is the kind of thing the trail exists to record, and
      // "invited as Client" alone does not say what they were shown.
      metadata: { email: body.email, role: body.role, ...(body.role === "CLIENT" ? { projectIds: body.projectIds } : {}) },
    });

    const org = await getOrganizationById(member.orgId);
    const orgName = org?.name ?? "your company";
    const link = `${appOrigin(request)}/signup?invite=${invite.token}`;
    // A customer and an employee get different letters. "Invited you to join
    // E2E Test Co as a Client" reads like a job offer from a company they are
    // paying, and says nothing about what the login actually shows them.
    const isClientInvite = body.role === "CLIENT";
    const projectNames = isClientInvite ? await listProjectNamesByIds(member.orgId, body.projectIds ?? []) : [];
    const email = await sendEmail({
      to: invite.email,
      subject: isClientInvite
        ? `${orgName} has given you access to your project`
        : `You're invited to join ${orgName} on BinaWorks`,
      html: isClientInvite
        ? clientInviteEmailHtml({ orgName, invitedByName: member.name, projectNames, link })
        : inviteEmailHtml({ orgName, roleLabel: ROLE_LABELS[body.role], invitedByName: member.name, link }),
    });

    // Still 201: the invitation exists and the link works whether or not the
    // email went. emailSent is what lets the UI say so instead of implying
    // the recipient has been told.
    return NextResponse.json({ invite, emailSent: email.delivered }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
