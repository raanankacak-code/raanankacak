import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberByUserId } from "@/lib/db/organizations";
import { can, type Permission } from "@/lib/permissions";
import { logger, errorFields } from "@/lib/logger";
import { getSubscriptionForOrgViaSession, isSubscriptionWritable } from "@/lib/db/subscriptions";
import type { OrgMember } from "@/lib/db/types";

export type CurrentMember = OrgMember;

/** Returns the signed-in Supabase user's active org membership, or null. */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return getMemberByUserId(user.id, { activeOnly: true });
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** For Route Handlers: gets the current member or throws a 401/403 ApiError. */
export async function requireMember(permission?: Permission): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) throw new ApiError(401, "Not signed in");
  if (permission && !can(member.role, permission)) {
    throw new ApiError(403, "Your role does not have this permission");
  }
  return member;
}

/**
 * requireMember + subscription write check, for routes that mutate business
 * data. When the org's trial has expired (or the subscription is cancelled)
 * the workspace is read-only: viewing and exporting keep working, writes get
 * a 402 pointing at the billing page. Trivial personal writes (profile name,
 * notification read state, bug reports) intentionally stay on requireMember.
 */
export async function requireWritableMember(permission?: Permission): Promise<CurrentMember> {
  const member = await requireMember(permission);
  const sub = await getSubscriptionForOrgViaSession(member.orgId);
  if (!isSubscriptionWritable(sub)) {
    throw new ApiError(
      402,
      sub.status === "TRIALING"
        ? "Your free trial has ended. Your data is safe and read-only — choose a plan on the Billing page to continue."
        : "Your subscription is inactive. Your data is safe and read-only — reactivate on the Billing page to continue.",
    );
  }
  return member;
}

export function apiErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Unexpected error: log the full detail server-side under a correlation id,
  // and return only that id to the client — a user quoting it (e.g. via the
  // bug-report form) lets us find the exact stack trace in the logs.
  const errorId = randomUUID();
  logger.error("Unhandled API error", { errorId, ...errorFields(err) });
  return NextResponse.json({ error: "Internal server error", errorId }, { status: 500 });
}
