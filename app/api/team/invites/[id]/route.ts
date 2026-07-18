import { NextResponse } from "next/server";
import { getInviteById, cancelInvite } from "@/lib/db/team";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("manageUsers");
    const { id } = await params;
    const invite = await getInviteById(member.orgId, id);
    if (!invite) throw new ApiError(404, "Invitation not found");
    await cancelInvite(member.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
