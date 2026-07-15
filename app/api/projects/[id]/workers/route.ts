import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

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
    const member = await requireMember("manageWorkers");
    const { id: projectId } = await params;
    const project = await prisma.project.findFirst({
      where: { id: projectId, orgId: member.orgId },
    });
    if (!project) throw new ApiError(404, "Project not found");

    const body = workerSchema.parse(await request.json());
    const worker = await prisma.worker.create({
      data: {
        orgId: member.orgId,
        projectId,
        name: body.name,
        trade: body.trade,
        dailyRate: body.dailyRate,
        icNumber: body.icNumber,
        cidbNumber: body.cidbNumber,
        cidbExpiry: body.cidbExpiry ? new Date(body.cidbExpiry) : undefined,
      },
    });
    return NextResponse.json({ worker }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
