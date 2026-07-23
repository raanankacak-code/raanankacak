import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/db/team";
import { apiErrorResponse, ApiError } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/db/auditLog";

/** Consumes an invitation right after the invited user signs up with Supabase Auth. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) throw new ApiError(401, "Not signed in");

    const { token } = await params;
    try {
      const { member } = await acceptInvite(token, { userId: user.id, email: user.email });
      await recordAuditEvent(member.orgId, {
        actorMemberId: member.id,
        actorName: member.name,
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
    return apiErrorResponse(err);
  }
}
