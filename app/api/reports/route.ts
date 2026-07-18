import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById } from "@/lib/db/projects";
import { listReports, createReport } from "@/lib/db/reports";
import { notify } from "@/lib/db/notifications";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

const reportSchema = z.object({
  projectId: z.string().min(1),
  date: z.string().min(1),
  weather: z.string().max(80).optional(),
  manpower: z.record(z.string(), z.number().int().nonnegative()).optional(),
  workCompleted: z.string().max(4000).optional(),
  delays: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  photos: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const reports = await listReports(member.orgId, {
      projectId: projectId || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    return NextResponse.json({ reports });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember("submitReports");
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
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
