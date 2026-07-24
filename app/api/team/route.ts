import { NextResponse } from "next/server";
import { listMembersForOrgViaSession } from "@/lib/db/team";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const member = await requireMember();
    const members = await listMembersForOrgViaSession(member.orgId);
    return NextResponse.json({ members, currentMemberId: member.id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
