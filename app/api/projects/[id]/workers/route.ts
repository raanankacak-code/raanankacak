import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById } from "@/lib/db/projects";
import { createWorker } from "@/lib/db/workers";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { assertCanAddWorker } from "@/lib/billing/limits";

const workerSchema = z.object({
  name: z.string().min(1).max(160),
  trade: z.string().max(80).optional(),
  dailyRate: z.coerce.number().nonnegative().optional(),
  icNumber: z.string().max(40).optional(),
  cidbNumber: z.string().max(40).optional(),
  cidbExpiry: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireWritableMember("manageWorkers");
    await assertCanAddWorker(member.orgId);
    const { id: projectId } = await params;
    const project = await getProjectById(member.orgId, projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const body = workerSchema.parse(await request.json());
    const worker = await createWorker(member.orgId, projectId, {
      name: body.name,
      trade: body.trade,
      dailyRate: body.dailyRate,
      icNumber: body.icNumber,
      cidbNumber: body.cidbNumber,
      cidbExpiry: body.cidbExpiry || undefined,
    });
    return NextResponse.json({ worker }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
