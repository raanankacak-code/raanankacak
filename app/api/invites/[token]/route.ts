import { NextResponse } from "next/server";
import { getInviteByToken } from "@/lib/db/team";
import { getOrganizationById } from "@/lib/db/organizations";

/** Public lookup used by the "I was invited" sign-up flow — no auth required. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);
  if (!invite || invite.status !== "PENDING" || invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invitation not found or no longer valid" }, { status: 404 });
  }
  const org = await getOrganizationById(invite.orgId);
  return NextResponse.json({
    invite: { name: invite.name, email: invite.email, role: invite.role },
    org: org ? { name: org.name, shortName: org.shortName } : null,
  });
}
