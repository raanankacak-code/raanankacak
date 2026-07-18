import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestById, transitionRequest, deleteRequest } from "@/lib/db/materials";
import { notify } from "@/lib/db/notifications";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("viewMaterials");
    const { id } = await params;
    const materialRequest = await getRequestById(member.orgId, id);
    if (!materialRequest) throw new ApiError(404, "Material request not found");
    return NextResponse.json({ request: materialRequest });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const transitionSchema = z.object({
  status: z.enum(["SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "DELIVERED"]),
  comment: z.string().max(1000).optional(),
  receivedQty: z.coerce.number().nonnegative().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    const { id } = await params;
    const existing = await getRequestById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Material request not found");

    const body = transitionSchema.parse(await request.json());
    const approverActions = new Set(["APPROVED", "REJECTED", "ORDERED", "DELIVERED"]);
    if (approverActions.has(body.status) && !can(member.role, "approveRequests")) {
      throw new ApiError(403, "Your role can't approve material requests");
    }

    const updated = await transitionRequest(member.orgId, id, {
      status: body.status,
      comment: body.comment,
      receivedQty: body.receivedQty,
      actorName: member.name,
    });

    if (body.status === "APPROVED" || body.status === "REJECTED") {
      await notify(
        member.orgId,
        "request",
        `Material Request ${body.status === "APPROVED" ? "Approved" : "Rejected"}`,
        `${existing.code} — ${existing.material} ${body.status.toLowerCase()} by ${member.name}.`,
      );
    }

    return NextResponse.json({ request: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    const { id } = await params;
    const existing = await getRequestById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Material request not found");
    const isOwnDraft = existing.status === "DRAFT" && existing.requestedById === member.id;
    if (!isOwnDraft && !can(member.role, "approveRequests")) {
      throw new ApiError(403, "Your role can't delete this material request");
    }
    await deleteRequest(member.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
