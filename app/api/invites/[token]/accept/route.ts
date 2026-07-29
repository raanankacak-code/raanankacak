import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/db/team";
import { apiErrorResponse, ApiError } from "@/lib/auth";
import { recordMemberAction } from "@/lib/db/auditLog";
import { recordLegalAcceptance } from "@/lib/db/legalAcceptances";

// An invited user is agreeing to the same documents the workspace owner did,
// on their own behalf. `literal(true)` so that false is rejected rather than
// recorded as a decline that still joins them.
const acceptSchema = z.object({
  acceptedTerms: z.literal(true, { message: "You must accept the terms of service and privacy notice" }),
});

/** Consumes an invitation right after the invited user signs up with Supabase Auth. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) throw new ApiError(401, "Not signed in");

    // A missing or unparseable body is a caller that never showed the
    // checkbox, which is the case this exists to refuse.
    const raw = await request.json().catch(() => null);
    acceptSchema.parse(raw);

    const { token } = await params;
    try {
      const { member } = await acceptInvite(token, { userId: user.id, email: user.email });
      await recordLegalAcceptance({ orgId: member.orgId, userId: user.id, email: user.email });
      await recordMemberAction(member, {
        action: "MEMBER_JOINED",
        entityType: "org_member",
        entityId: member.id,
        summary: `${member.name} joined as ${member.role}`,
        metadata: { role: member.role },
      });
      return NextResponse.json({ member });
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Could not accept invitation");
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
