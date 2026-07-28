import { NextResponse } from "next/server";
import { z } from "zod";
import { getInspectionById, closeInspection, deleteInspection } from "@/lib/db/safety";
import { inspectionPhotoUrls } from "@/lib/safety";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { removeObjectsByUrl } from "@/lib/uploads";
import { can } from "@/lib/permissions";

// Only `status: CLOSED` is accepted. The checklist itself cannot be edited
// after filing — a record of what was found on site that can be revised later
// is not evidence of anything, and "we fixed it" is a different fact from
// "it was fine", so it gets its own field rather than overwriting the first.
const patchSchema = z.object({ status: z.literal("CLOSED") });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("viewReports");
    const { id } = await params;
    const inspection = await getInspectionById(member.orgId, id);
    if (!inspection) throw new ApiError(404, "Inspection not found");
    return NextResponse.json({ inspection });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("closeInspections");
    const { id } = await params;
    const existing = await getInspectionById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Inspection not found");
    patchSchema.parse(await request.json());

    if (existing.status === "CLOSED") {
      throw new ApiError(409, "This inspection is already closed");
    }

    const inspection = await closeInspection(member.orgId, id, member.name);

    await recordMemberAction(member, {
      action: "SAFETY_INSPECTION_CLOSED",
      entityType: "safety_inspection",
      entityId: id,
      summary: `${member.name} closed safety inspection ${existing.code}, with ${existing.failedCount} finding${existing.failedCount === 1 ? "" : "s"} actioned`,
      metadata: { code: existing.code, failedCount: existing.failedCount, projectId: existing.projectId },
    });

    return NextResponse.json({ inspection });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Only closing an inspection is permitted" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Deliberately narrower than filing: a Site Supervisor can raise an
    // inspection but cannot make one disappear. Deleting a safety record is
    // the action most worth restricting, and most worth recording.
    const member = await requireWritableMember("manageProjects");
    const { id } = await params;
    if (!can(member.role, "closeInspections")) {
      throw new ApiError(403, "Your role can't delete safety inspections");
    }

    const existing = await getInspectionById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Inspection not found");

    await deleteInspection(member.orgId, id);
    await removeObjectsByUrl(member.orgId, inspectionPhotoUrls(existing));

    await recordMemberAction(member, {
      action: "SAFETY_INSPECTION_DELETED",
      entityType: "safety_inspection",
      entityId: id,
      summary: `${member.name} deleted safety inspection ${existing.code} of ${existing.date} (${existing.outcome.replace("_", " ").toLowerCase()}, ${existing.failedCount} finding${existing.failedCount === 1 ? "" : "s"})`,
      metadata: {
        code: existing.code,
        date: existing.date,
        outcome: existing.outcome,
        failedCount: existing.failedCount,
        projectId: existing.projectId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
