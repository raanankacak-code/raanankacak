import { NextResponse } from "next/server";
import { z } from "zod";
import { listRequestsForOrgViaSession, countRequestsForOrg, createRequest } from "@/lib/db/materials";
import { getProjectById } from "@/lib/db/projects";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { recordMemberAction } from "@/lib/db/auditLog";

const createSchema = z.object({
  projectId: z.string().uuid(),
  material: z.string().min(1).max(160),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1).max(40),
  neededBy: z.string().optional(),
  justification: z.string().max(1000).optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
});

export async function GET(request: Request) {
  try {
    const member = await requireMember("viewMaterials");
    const url = new URL(request.url);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    const [requests, total] = await Promise.all([
      listRequestsForOrgViaSession(member.orgId, { offset }),
      countRequestsForOrg(member.orgId),
    ]);
    // `total` lets the client show progress through the full set.
    return NextResponse.json({ requests, total, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("submitRequests");
    const body = createSchema.parse(await request.json());
    const project = await getProjectById(member.orgId, body.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const created = await createRequest(member.orgId, {
      ...body,
      requestedById: member.id,
      requestedByName: member.name,
    });

    await recordMemberAction(member, {
      action: "MATERIAL_REQUEST_CREATED",
      entityType: "material_request",
      entityId: created.id,
      summary: `${member.name} raised ${created.code} for ${created.qty} ${created.unit} of ${created.material} on "${project.name}"`,
      metadata: { code: created.code, material: created.material, qty: created.qty, unit: created.unit, status: created.status },
    });
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
