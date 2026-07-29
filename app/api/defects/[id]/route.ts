import { NextResponse } from "next/server";
import { z } from "zod";
import { getDefectById, updateDefect, deleteDefect } from "@/lib/db/defects";
import { getMemberById } from "@/lib/db/team";
import { canTransition, defectPhotoUrls, DEFECT_SEVERITIES, DEFECT_STATUSES } from "@/lib/defects";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { removeObjectsByUrl } from "@/lib/uploads";
import { can } from "@/lib/permissions";

const patchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  severity: z.enum(DEFECT_SEVERITIES as [string, ...string[]]).optional(),
  status: z.enum(DEFECT_STATUSES as [string, ...string[]]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  resolutionNotes: z.string().max(4000).nullable().optional(),
  resolutionPhotos: z.array(z.string()).max(12).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("viewReports");
    const { id } = await params;
    const defect = await getDefectById(member.orgId, id);
    if (!defect) throw new ApiError(404, "Defect not found");
    return NextResponse.json({ defect });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Raising is the lower bar; closing is checked separately below, so a
    // Site Supervisor can update and resolve a defect but not sign it off.
    const member = await requireWritableMember("raiseDefects");
    const { id } = await params;
    const existing = await getDefectById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Defect not found");

    const body = patchSchema.parse(await request.json());

    if (body.status && body.status !== existing.status) {
      if (!canTransition(existing.status, body.status as (typeof DEFECT_STATUSES)[number])) {
        // Closed is the end. Reopening would leave closed_at and
        // closed_by_name describing an event that is no longer true.
        throw new ApiError(
          409,
          existing.status === "CLOSED"
            ? "This defect is closed. Raise a new one rather than reopening it."
            : `Cannot move a defect from ${existing.status} to ${body.status}`,
        );
      }
      if (body.status === "CLOSED" && !can(member.role, "closeDefects")) {
        // The whole point of a snag list: the person who fixed it is not the
        // person who signs it off.
        throw new ApiError(403, "Your role can mark a defect resolved, but not close it");
      }
    }

    // Resolved without saying what was done is a checkbox, not a record.
    const becomingResolved = body.status === "RESOLVED" && existing.status !== "RESOLVED";
    if (becomingResolved) {
      const notes = body.resolutionNotes ?? existing.resolutionNotes;
      const photos = body.resolutionPhotos ?? existing.resolutionPhotos;
      if (!notes?.trim() && photos.length === 0) {
        throw new ApiError(400, "Say what was done, or attach a photo of the fix, before marking this resolved");
      }
    }

    let assignedToName: string | null | undefined;
    if (body.assignedToId !== undefined) {
      if (body.assignedToId === null) {
        assignedToName = null;
      } else {
        const assignee = await getMemberById(member.orgId, body.assignedToId);
        if (!assignee) throw new ApiError(404, "That team member is not in this workspace");
        assignedToName = assignee.name;
      }
    }

    const defect = await updateDefect(member.orgId, id, {
      title: body.title,
      location: body.location,
      description: body.description,
      severity: body.severity as (typeof DEFECT_SEVERITIES)[number] | undefined,
      status: body.status as (typeof DEFECT_STATUSES)[number] | undefined,
      assignedToId: body.assignedToId,
      assignedToName,
      dueDate: body.dueDate,
      resolutionNotes: body.resolutionNotes,
      resolutionPhotos: body.resolutionPhotos,
      closedByName: member.name,
    });
    if (!defect) throw new ApiError(404, "Defect not found");

    const closed = body.status === "CLOSED" && existing.status !== "CLOSED";
    await recordMemberAction(member, {
      action: closed ? "DEFECT_CLOSED" : "DEFECT_UPDATED",
      entityType: "defect",
      entityId: id,
      summary: closed
        ? `${member.name} closed defect ${existing.code} — "${existing.title}"`
        : `${member.name} updated defect ${existing.code}${body.status ? ` to ${body.status.replace("_", " ").toLowerCase()}` : ""}`,
      metadata: {
        code: existing.code,
        from: existing.status,
        to: defect.status,
        projectId: existing.projectId,
      },
    });

    return NextResponse.json({ defect });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Deliberately narrower than raising, matching the safety module: a Site
    // Supervisor can raise a defect but cannot make one disappear. Deleting
    // the record of a problem is the action most worth restricting.
    const member = await requireWritableMember("raiseDefects");
    if (!can(member.role, "closeDefects")) {
      throw new ApiError(403, "Your role can't delete defects");
    }

    const { id } = await params;
    const existing = await getDefectById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Defect not found");

    await deleteDefect(member.orgId, id);
    // Both sets of photos — the problem and the fix. Forgetting the second is
    // silent: the row goes, the objects stay.
    await removeObjectsByUrl(member.orgId, defectPhotoUrls(existing));

    await recordMemberAction(member, {
      action: "DEFECT_DELETED",
      entityType: "defect",
      entityId: id,
      summary: `${member.name} deleted defect ${existing.code} — "${existing.title}" (${existing.severity.toLowerCase()}, ${existing.status.replace("_", " ").toLowerCase()})`,
      metadata: {
        code: existing.code,
        severity: existing.severity,
        status: existing.status,
        projectId: existing.projectId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
