import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/permissions";
import type { OrgMember } from "@/app/generated/prisma/client";

export type CurrentMember = OrgMember;

/** Returns the signed-in Supabase user's active org membership, or null. */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return prisma.orgMember.findFirst({
    where: { userId: user.id, active: true },
  });
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
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
