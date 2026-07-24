import { NextResponse } from "next/server";
import { listAuditLogForOrgViaSession } from "@/lib/db/auditLog";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const member = await requireMember("viewAuditLog");
    const entries = await listAuditLogForOrgViaSession(member.orgId);
    return NextResponse.json({ entries });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
