import { NextResponse } from "next/server";
import { getInviteById, cancelInvite } from "@/lib/db/team";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { recordMemberAction } from "@/lib/db/auditLog";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("manageUsers");
    const { id } = await params;
    const invite = await getInviteById(member.orgId, id);
    if (!invite) throw new ApiError(404, "Invitation not found");
    await cancelInvite(member.orgId, id);

    await recordMemberAction(member, {
      action: "MEMBER_INVITE_REVOKED",
      entityType: "org_invite",
      entityId: id,
      summary: `${member.name} revoked the invitation for ${invite.email}`,
      metadata: { email: invite.email, role: invite.role },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
