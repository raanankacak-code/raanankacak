import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
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

    const reports = await prisma.dailyReport.findMany({
      where: {
        orgId: member.orgId,
        projectId: projectId || undefined,
        date: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
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

    const project = await prisma.project.findFirst({
      where: { id: body.projectId, orgId: member.orgId },
    });
    if (!project) throw new ApiError(404, "Project not found");

    const report = await prisma.dailyReport.create({
      data: {
        orgId: member.orgId,
        projectId: body.projectId,
        date: new Date(body.date),
        weather: body.weather,
        manpower: body.manpower,
        workCompleted: body.workCompleted,
        delays: body.delays,
        notes: body.notes,
        photos: body.photos,
        submittedById: member.userId,
        submittedByName: member.name,
      },
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
