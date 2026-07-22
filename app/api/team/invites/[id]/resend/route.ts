import { NextResponse } from "next/server";
import { getInviteById, resendInvite } from "@/lib/db/team";
import { getOrganizationById } from "@/lib/db/organizations";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { sendEmail, inviteEmailHtml } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("manageUsers");
    const { id } = await params;
    const existing = await getInviteById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Invitation not found");
    const invite = await resendInvite(member.orgId, id);

    const org = await getOrganizationById(member.orgId);
    const link = `${new URL(request.url).origin}/signup?invite=${invite.token}`;
    await sendEmail({
      to: invite.email,
      subject: `Reminder: you're invited to join ${org?.name ?? "your company"} on BinaWorks`,
      html: inviteEmailHtml({
        orgName: org?.name ?? "your company",
        roleLabel: ROLE_LABELS[invite.role],
        invitedByName: member.name,
        link,
      }),
    });

    return NextResponse.json({ invite });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
