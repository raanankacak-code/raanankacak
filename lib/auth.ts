import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberByUserId } from "@/lib/db/organizations";
import { can, isClient, type Permission } from "@/lib/permissions";
import { reportError, isClientDisconnect } from "@/lib/logger";
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

/**
 * For Route Handlers: gets the current member or throws a 401/403 ApiError.
 *
 * A CLIENT is refused outright unless the route says otherwise. That is the
 * important part of this function: a client is inside the org, so every route
 * that only checks a permission would have to remember to exclude them, and
 * one that forgot would hand a customer the whole workspace. Default-deny
 * here means a new route is closed to clients until someone decides
 * otherwise, and the portal's own routes are the handful that opt in.
 */
export async function requireMember(
  permission?: Permission,
  options?: { allowClient?: boolean },
): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) throw new ApiError(401, "Not signed in");
  if (isClient(member.role) && !options?.allowClient) {
    // Deliberately the same wording a staff member gets for a permission they
    // lack: a client should not be able to map the app by reading errors.
    throw new ApiError(403, "Your role does not have this permission");
  }
  if (permission && !can(member.role, permission)) {
    throw new ApiError(403, "Your role does not have this permission");
  }
  return member;
}

/** For the portal's own routes: the caller must be a client, and nothing else. */
export async function requireClient(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) throw new ApiError(401, "Not signed in");
  if (!isClient(member.role)) throw new ApiError(403, "This area is for client accounts");
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
  // The caller hung up mid-request: there is nobody left to receive a
  // response and nothing went wrong, so don't mint a correlation id or raise
  // an alert for it. 499 is nginx's "client closed request" — never actually
  // delivered, but it keeps access logs honest about what happened.
  if (isClientDisconnect(err)) {
    reportError("Unhandled API error", err);
    return NextResponse.json({ error: "Client closed request" }, { status: 499 });
  }

  // Unexpected error: log the full detail server-side under a correlation id,
  // and return only that id to the client — a user quoting it (e.g. via the
  // bug-report form) lets us find the exact stack trace in the logs.
  const errorId = randomUUID();
  reportError("Unhandled API error", err, { errorId });
  return NextResponse.json({ error: "Internal server error", errorId }, { status: 500 });
}
