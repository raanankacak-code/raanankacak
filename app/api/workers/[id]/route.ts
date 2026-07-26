import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkerById, updateWorker, deleteWorker } from "@/lib/db/workers";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { recordAuditEvent, recordMemberAction } from "@/lib/db/auditLog";
import { formatCurrency } from "@/lib/format";

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  trade: z.string().max(80).optional(),
  dailyRate: z.coerce.number().nonnegative().optional(),
  icNumber: z.string().max(40).optional(),
  cidbNumber: z.string().max(40).optional(),
  cidbExpiry: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireWritableMember("manageWorkers");
    const { id } = await params;
    const existing = await getWorkerById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Worker not found");

    const body = updateSchema.parse(await request.json());
    const worker = await updateWorker(member.orgId, id, {
      ...body,
      cidbExpiry: body.cidbExpiry || undefined,
    });

    if (body.dailyRate !== undefined && body.dailyRate !== existing.dailyRate) {
      await recordAuditEvent(member.orgId, {
        actorMemberId: member.id,
        actorName: member.name,
        action: "WORKER_RATE_CHANGED",
        entityType: "worker",
        entityId: worker.id,
        summary: `${member.name} changed ${worker.name}'s daily rate from ${formatCurrency(existing.dailyRate)} to ${formatCurrency(body.dailyRate)}`,
        metadata: { from: existing.dailyRate, to: body.dailyRate },
      });
    }

    return NextResponse.json({ worker });
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
    const member = await requireWritableMember("manageWorkers");
    const { id } = await params;
    const existing = await getWorkerById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Worker not found");
    await deleteWorker(member.orgId, id);

    await recordMemberAction(member, {
      action: "WORKER_REMOVED",
      entityType: "worker",
      entityId: id,
      summary: `${member.name} removed ${existing.name} from the workforce`,
      metadata: { name: existing.name, dailyRate: existing.dailyRate },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
