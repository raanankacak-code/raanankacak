import { NextResponse } from "next/server";
import { z } from "zod";
import { appendInspectionPhotos, getInspectionById, removeInspectionPhoto } from "@/lib/db/safety";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { removeObjectsByUrl } from "@/lib/uploads";
import { safeUrlSchema } from "@/lib/url-validation";

const addSchema = z.object({ photos: z.array(safeUrlSchema).min(1).max(12) });
const removeSchema = z.object({ url: safeUrlSchema });

/**
 * Evidence added after the inspection was filed.
 *
 * The photograph of the fix arrives the next day, and until now there was
 * nowhere to put it — so it ended up in somebody's phone gallery, which is
 * not a record. A closed inspection accepts photographs too, for exactly that
 * reason.
 *
 * What this route deliberately cannot do is change the checklist. `photos` is
 * the only column it touches: what was found on site stays as it was found,
 * and every addition is attributed in the audit trail.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Whoever can file an inspection can add evidence to one.
    const member = await requireWritableMember("submitInspections");
    const { id } = await params;

    const existing = await getInspectionById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Inspection not found");

    const body = addSchema.parse(await request.json());
    const inspection = await appendInspectionPhotos(member.orgId, id, body.photos);

    await recordMemberAction(member, {
      action: "SAFETY_PHOTO_ADDED",
      entityType: "safety_inspection",
      entityId: id,
      summary: `${member.name} added ${body.photos.length} photo${body.photos.length === 1 ? "" : "s"} to safety inspection ${existing.code}`,
      metadata: { code: existing.code, projectId: existing.projectId, added: body.photos.length },
    });

    return NextResponse.json({ inspection });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

/**
 * Taking one back off.
 *
 * Narrower than adding — the roles that can close an inspection — because
 * removing evidence from a safety record is not a routine act. It exists
 * because an accidental upload can carry a worker's IC number, and "the
 * record is immutable" is not an answer to a request to erase that. The url
 * goes into the audit entry, so the removal is itself part of the record.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("closeInspections");
    const { id } = await params;

    const existing = await getInspectionById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Inspection not found");

    const body = removeSchema.parse(await request.json());
    // Only from the inspection's own photo list. A url that belongs to a
    // finding inside the checklist, or to another record entirely, is not
    // this route's to delete.
    if (!existing.photos.includes(body.url)) throw new ApiError(404, "That photo is not on this inspection");

    const inspection = await removeInspectionPhoto(member.orgId, id, body.url);
    // The row no longer points at it, so the object in storage would be
    // orphaned — and an orphan still counts against the workspace's quota.
    await removeObjectsByUrl(member.orgId, [body.url]);

    await recordMemberAction(member, {
      action: "SAFETY_PHOTO_REMOVED",
      entityType: "safety_inspection",
      entityId: id,
      summary: `${member.name} removed a photo from safety inspection ${existing.code}`,
      metadata: { code: existing.code, projectId: existing.projectId, url: body.url },
    });

    return NextResponse.json({ inspection });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
