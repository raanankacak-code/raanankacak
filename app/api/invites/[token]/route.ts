import { NextResponse } from "next/server";
import { getInviteByToken } from "@/lib/db/team";
import { getOrganizationById } from "@/lib/db/organizations";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/** Public lookup used by the "I was invited" sign-up flow — no auth required. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // The only unauthenticated route in the app that accepts a client-supplied
  // secret (the invite token) — rate-limit by IP to slow down token guessing.
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`invite-lookup:${ip}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

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
