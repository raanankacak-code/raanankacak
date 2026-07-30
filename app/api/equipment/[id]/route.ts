import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEquipmentById,
  updateEquipment,
  deleteEquipment,
  listUsageLogsForEquipment,
  getEquipmentHours,
} from "@/lib/db/equipment";
import { getProjectById } from "@/lib/db/projects";
import { equipmentPhotoUrls, EQUIPMENT_STATUSES } from "@/lib/equipment";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { removeObjectsByUrl } from "@/lib/uploads";
import { safeUrlSchema } from "@/lib/url-validation";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  type: z.string().max(80).nullable().optional(),
  registrationNo: z.string().max(80).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  owned: z.boolean().optional(),
  supplier: z.string().max(200).nullable().optional(),
  status: z.enum(EQUIPMENT_STATUSES as [string, ...string[]]).optional(),
  lastServiceDate: DATE.nullable().optional(),
  nextServiceDate: DATE.nullable().optional(),
  inspectionExpiry: DATE.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  photos: z.array(safeUrlSchema).max(12).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("viewReports");
    const { id } = await params;
    const equipment = await getEquipmentById(member.orgId, id);
    if (!equipment) throw new ApiError(404, "Equipment not found");

    // Hours come from the view, not from summing the page of logs below —
    // that would under-report the moment a machine has more logs than the
    // page holds, and would do it silently.
    const [logs, hours] = await Promise.all([
      listUsageLogsForEquipment(member.orgId, id),
      getEquipmentHours(member.orgId, id),
    ]);

    return NextResponse.json({ equipment, logs, hours });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("manageEquipment");
    const { id } = await params;
    const existing = await getEquipmentById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Equipment not found");

    const body = patchSchema.parse(await request.json());

    if (body.projectId) {
      const project = await getProjectById(member.orgId, body.projectId);
      if (!project) throw new ApiError(404, "Project not found");
    }

    const equipment = await updateEquipment(member.orgId, id, body as Parameters<typeof updateEquipment>[2]);
    if (!equipment) throw new ApiError(404, "Equipment not found");

    const retired = body.status === "RETIRED" && existing.status !== "RETIRED";
    await recordMemberAction(member, {
      action: retired ? "EQUIPMENT_RETIRED" : "EQUIPMENT_UPDATED",
      entityType: "equipment",
      entityId: id,
      summary: retired
        ? `${member.name} retired ${existing.code} — ${existing.name}`
        : `${member.name} updated ${existing.code} — ${existing.name}`,
      metadata: { code: existing.code, from: existing.status, to: equipment.status },
    });

    return NextResponse.json({ equipment });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("manageEquipment");
    const { id } = await params;
    const existing = await getEquipmentById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Equipment not found");

    // Usage logs cascade with the machine at the database level. That is the
    // right call — hours against a machine that no longer exists are not a
    // record of anything — but it means deleting is destructive in a way
    // retiring is not, which is what the UI steers people towards.
    await deleteEquipment(member.orgId, id);
    await removeObjectsByUrl(member.orgId, equipmentPhotoUrls(existing));

    await recordMemberAction(member, {
      action: "EQUIPMENT_DELETED",
      entityType: "equipment",
      entityId: id,
      summary: `${member.name} deleted ${existing.code} — ${existing.name}, and its usage history with it`,
      metadata: { code: existing.code, name: existing.name, projectId: existing.projectId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
