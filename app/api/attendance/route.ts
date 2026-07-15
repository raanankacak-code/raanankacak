import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

const upsertSchema = z.object({
  projectId: z.string().min(1),
  date: z.string().min(1),
  records: z.array(
    z.object({
      workerId: z.string().min(1),
      status: z.enum(["PRESENT", "HALF_DAY", "ABSENT"]),
      timeIn: z.string().max(10).optional(),
      timeOut: z.string().max(10).optional(),
    }),
  ),
});

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const date = searchParams.get("date");
    if (!projectId || !date) {
      throw new ApiError(400, "projectId and date are required");
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, orgId: member.orgId },
    });
    if (!project) throw new ApiError(404, "Project not found");

    const [workers, records] = await Promise.all([
      prisma.worker.findMany({
        where: { projectId, active: true },
        orderBy: { name: "asc" },
      }),
      prisma.attendanceRecord.findMany({
        where: { projectId, date: new Date(date) },
      }),
    ]);

    return NextResponse.json({ workers, records });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const member = await requireMember("takeAttendance");
    const body = upsertSchema.parse(await request.json());

    const project = await prisma.project.findFirst({
      where: { id: body.projectId, orgId: member.orgId },
    });
    if (!project) throw new ApiError(404, "Project not found");

    const date = new Date(body.date);
    await prisma.$transaction(
      body.records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: { workerId_date: { workerId: r.workerId, date } },
          create: {
            orgId: member.orgId,
            projectId: body.projectId,
            workerId: r.workerId,
            date,
            status: r.status,
            timeIn: r.timeIn,
            timeOut: r.timeOut,
          },
          update: {
            status: r.status,
            timeIn: r.timeIn,
            timeOut: r.timeOut,
          },
        }),
      ),
    );

    const records = await prisma.attendanceRecord.findMany({
      where: { projectId: body.projectId, date },
    });
    return NextResponse.json({ records });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
