import { NextResponse } from "next/server";
import { getInviteById, resendInvite } from "@/lib/db/team";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("manageUsers");
    const { id } = await params;
    const existing = await getInviteById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Invitation not found");
    const invite = await resendInvite(member.orgId, id);
    return NextResponse.json({ invite });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
