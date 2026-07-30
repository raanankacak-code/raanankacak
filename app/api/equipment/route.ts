import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listEquipmentForOrgViaSession,
  countEquipmentForOrg,
  createEquipment,
} from "@/lib/db/equipment";
import { getProjectById } from "@/lib/db/projects";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { safeUrlSchema } from "@/lib/url-validation";
import { EQUIPMENT_STATUSES } from "@/lib/equipment";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// `code` is absent on purpose: the reference is the server's to allocate, or
// two machines end up as EQ-004.
const createSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.string().max(80).optional(),
  registrationNo: z.string().max(80).optional(),
  /** null or omitted means it is in the yard rather than on a site. */
  projectId: z.string().uuid().nullable().optional(),
  owned: z.boolean(),
  supplier: z.string().max(200).optional(),
  status: z.enum(EQUIPMENT_STATUSES as [string, ...string[]]).optional(),
  lastServiceDate: DATE.optional(),
  nextServiceDate: DATE.optional(),
  inspectionExpiry: DATE.optional(),
  notes: z.string().max(2000).optional(),
  photos: z.array(safeUrlSchema).max(12).optional(),
});

export async function GET(request: Request) {
  try {
    // Viewing matches safety and defects: anyone who can see reports can see
    // the plant register. Knowing a machine's inspection has lapsed is not
    // privileged information on a site.
    const member = await requireMember("viewReports");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? undefined;
    const status = EQUIPMENT_STATUSES.find((s) => s === statusParam);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    const [equipment, total] = await Promise.all([
      listEquipmentForOrgViaSession(member.orgId, { projectId, status, offset }),
      countEquipmentForOrg(member.orgId, { projectId, status }),
    ]);
    return NextResponse.json({ equipment, total, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("manageEquipment");
    const body = createSchema.parse(await request.json());

    // Verified rather than trusted: a project id from another workspace
    // would otherwise put a machine on somebody else's site.
    if (body.projectId) {
      const project = await getProjectById(member.orgId, body.projectId);
      if (!project) throw new ApiError(404, "Project not found");
    }

    const equipment = await createEquipment(member.orgId, {
      name: body.name,
      type: body.type,
      registrationNo: body.registrationNo,
      projectId: body.projectId ?? null,
      owned: body.owned,
      supplier: body.supplier,
      status: body.status as (typeof EQUIPMENT_STATUSES)[number] | undefined,
      lastServiceDate: body.lastServiceDate,
      nextServiceDate: body.nextServiceDate,
      inspectionExpiry: body.inspectionExpiry,
      notes: body.notes,
      photos: body.photos,
    });

    await recordMemberAction(member, {
      action: "EQUIPMENT_REGISTERED",
      entityType: "equipment",
      entityId: equipment.id,
      summary: `${member.name} registered ${equipment.code} — ${equipment.name}${equipment.owned ? "" : ` (hired${equipment.supplier ? ` from ${equipment.supplier}` : ""})`}`,
      metadata: {
        code: equipment.code,
        owned: equipment.owned,
        projectId: equipment.projectId,
        inspectionExpiry: equipment.inspectionExpiry,
      },
    });

    return NextResponse.json({ equipment }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
