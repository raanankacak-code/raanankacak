import { NextResponse } from "next/server";
import { z } from "zod";
import { getEquipmentById, createUsageLog, getEquipmentHours } from "@/lib/db/equipment";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";

// `hours` is capped at 24 here as well as by a CHECK constraint. The database
// is the guarantee; this is so a typo comes back as a sentence rather than a
// Postgres error string.
const logSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(24),
  operatorName: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Deliberately looser than managing the register: a Site Supervisor or
    // Engineer logs the hours a machine actually did, which is a record of
    // what happened rather than a change to what the company owns.
    const member = await requireWritableMember("logEquipmentUsage");
    const { id } = await params;

    const equipment = await getEquipmentById(member.orgId, id);
    if (!equipment) throw new ApiError(404, "Equipment not found");
    if (equipment.status === "RETIRED") {
      throw new ApiError(409, "This machine is retired — reactivate it before logging more hours against it");
    }

    const body = logSchema.parse(await request.json());

    const log = await createUsageLog(member.orgId, {
      equipmentId: id,
      // Taken from the machine rather than the request: the hours belong to
      // wherever it is deployed, and letting the caller name the project
      // would allow hours to be booked against a site it never visited.
      projectId: equipment.projectId,
      date: body.date,
      hours: body.hours,
      operatorName: body.operatorName,
      notes: body.notes,
      loggedById: member.id,
      loggedByName: member.name,
    });

    await recordMemberAction(member, {
      action: "EQUIPMENT_USAGE_LOGGED",
      entityType: "equipment",
      entityId: id,
      summary: `${member.name} logged ${body.hours}h on ${equipment.code} — ${equipment.name} for ${body.date}`,
      metadata: { code: equipment.code, date: body.date, hours: body.hours, projectId: equipment.projectId },
    });

    const hours = await getEquipmentHours(member.orgId, id);
    return NextResponse.json({ log, hours }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
