import { NextResponse } from "next/server";
import { getOrganizationById } from "@/lib/db/organizations";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const member = await requireMember();
    const org = await getOrganizationById(member.orgId);
    return NextResponse.json({ member, org });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
