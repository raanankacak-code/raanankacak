import { NextResponse } from "next/server";
import { getInviteById, resendInvite } from "@/lib/db/team";
import { getOrganizationById } from "@/lib/db/organizations";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { sendEmail, inviteEmailHtml } from "@/lib/email";
import { appOrigin } from "@/lib/appOrigin";
import { checkRateLimit } from "@/lib/rateLimit";
import { recordMemberAction } from "@/lib/db/auditLog";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("manageUsers");
    const rateLimit = await checkRateLimit(`invite-create:${member.id}`, 20, 60_000);
    if (!rateLimit.allowed) {
      throw new ApiError(429, "Too many invites sent. Try again shortly.");
    }
    const { id } = await params;
    const existing = await getInviteById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Invitation not found");
    const invite = await resendInvite(member.orgId, id);

    const org = await getOrganizationById(member.orgId);
    const link = `${appOrigin(request)}/signup?invite=${invite.token}`;
    const email = await sendEmail({
      to: invite.email,
      subject: `Reminder: you're invited to join ${org?.name ?? "your company"} on BinaWorks`,
      html: inviteEmailHtml({
        orgName: org?.name ?? "your company",
        roleLabel: ROLE_LABELS[invite.role],
        invitedByName: member.name,
        link,
      }),
    });

    // Recorded because resending mints a fresh token and extends the expiry —
    // it is a new way into the workspace, not just another email.
    await recordMemberAction(member, {
      action: "MEMBER_INVITE_RESENT",
      entityType: "org_invite",
      entityId: invite.id,
      summary: `${member.name} resent the invitation for ${invite.email} as ${ROLE_LABELS[invite.role]}`,
      metadata: { email: invite.email, role: invite.role },
    });

    // The invite is valid either way — the link can be copied from the team
    // list. Saying whether the email actually went is the difference between
    // "they'll get an email" and "nothing happened and nobody knows".
    return NextResponse.json({ invite, emailSent: email.delivered });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
