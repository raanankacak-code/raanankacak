import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberByUserId } from "@/lib/db/organizations";
import { can, type Permission } from "@/lib/permissions";
import { logger, errorFields } from "@/lib/logger";
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
