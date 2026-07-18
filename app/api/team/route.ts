import { NextResponse } from "next/server";
import { listMembersForOrg } from "@/lib/db/team";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const member = await requireMember();
    const members = await listMembersForOrg(member.orgId);
    return NextResponse.json({ members, currentMemberId: member.id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
