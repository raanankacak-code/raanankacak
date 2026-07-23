import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById } from "@/lib/db/projects";
import { listActiveWorkersForProject, listWorkerIdsForProject } from "@/lib/db/workers";
import { listAttendanceForProjectDate, upsertAttendanceRecords } from "@/lib/db/attendance";
import { notify } from "@/lib/db/notifications";
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

    const project = await getProjectById(member.orgId, projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const [workers, records] = await Promise.all([
      listActiveWorkersForProject(projectId),
      listAttendanceForProjectDate(projectId, date),
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

    const project = await getProjectById(member.orgId, body.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    // Every worker id must belong to this project — otherwise a crafted request
    // could upsert (and, via the worker_id+date unique constraint, silently
    // overwrite) another org's attendance record.
    const validWorkerIds = await listWorkerIdsForProject(body.projectId);
    const unknownWorkerId = body.records.find((r) => !validWorkerIds.has(r.workerId));
    if (unknownWorkerId) {
      throw new ApiError(400, "One or more workers do not belong to this project");
    }

    const records = await upsertAttendanceRecords(member.orgId, body.projectId, body.date, body.records);
    const present = body.records.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length;
    await notify(
      member.orgId,
      "attendance",
      "Attendance Completed",
      `${present} of ${body.records.length} workers checked in at ${project.name} for ${body.date}.`,
    );
    return NextResponse.json({ records });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
