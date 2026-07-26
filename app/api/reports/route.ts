import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById } from "@/lib/db/projects";
import { listReportsViaSession, countReportsForOrg, createReport } from "@/lib/db/reports";
import { notify } from "@/lib/db/notifications";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { safeUrlSchema } from "@/lib/url-validation";

const reportSchema = z.object({
  projectId: z.string().min(1),
  date: z.string().min(1),
  weather: z.string().max(80).optional(),
  manpower: z.record(z.string(), z.number().int().nonnegative()).optional(),
  workCompleted: z.string().max(4000).optional(),
  delays: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  photos: z.array(safeUrlSchema).optional(),
});

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

    const filters = {
      projectId: projectId || undefined,
      from: from || undefined,
      to: to || undefined,
    };
    const [reports, total] = await Promise.all([
      listReportsViaSession(member.orgId, { ...filters, offset }),
      countReportsForOrg(member.orgId, filters),
    ]);
    return NextResponse.json({ reports, total, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("submitReports");
    const body = reportSchema.parse(await request.json());

    const project = await getProjectById(member.orgId, body.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const report = await createReport(member.orgId, {
      projectId: body.projectId,
      date: body.date,
      weather: body.weather,
      manpower: body.manpower,
      workCompleted: body.workCompleted,
      delays: body.delays,
      notes: body.notes,
      photos: body.photos,
      submittedById: member.userId,
      submittedByName: member.name,
    });
    await notify(member.orgId, "report", "Daily Report Submitted", `${member.name} filed a report for ${project.name}.`);
    await recordMemberAction(member, {
      action: "REPORT_SUBMITTED",
      entityType: "daily_report",
      entityId: report.id,
      summary: `${member.name} filed the ${body.date} daily report for "${project.name}"`,
      metadata: { date: body.date, projectId: project.id, photos: body.photos?.length ?? 0 },
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
