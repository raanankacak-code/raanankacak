import { NextResponse } from "next/server";
import { z } from "zod";
import { getReportById, updateReportStatus, deleteReport } from "@/lib/db/reports";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/db/auditLog";
import { removeObjectsByUrl } from "@/lib/uploads";
import { formatDate } from "@/lib/format";

const updateSchema = z.object({
  status: z.enum(["SUBMITTED", "REVIEWED"]).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireMember();
    const { id } = await params;
    const report = await getReportById(member.orgId, id);
    if (!report) throw new ApiError(404, "Report not found");
    return NextResponse.json({ report });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireWritableMember("reviewReports");
    const { id } = await params;
    const existing = await getReportById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Report not found");

    const body = updateSchema.parse(await request.json());
    const report = body.status
      ? await updateReportStatus(member.orgId, id, body.status)
      : existing;

    if (body.status === "REVIEWED" && existing.status !== "REVIEWED") {
      await recordAuditEvent(member.orgId, {
        actorMemberId: member.id,
        actorName: member.name,
        action: "REPORT_REVIEWED",
        entityType: "daily_report",
        entityId: report.id,
        summary: `${member.name} reviewed the ${formatDate(existing.date)} daily report for ${existing.project.name}`,
      });
    }

    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireWritableMember("reviewReports");
    const { id } = await params;
    const existing = await getReportById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Report not found");
    await deleteReport(member.orgId, id);
    await removeObjectsByUrl(member.orgId, existing.photos ?? []);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
