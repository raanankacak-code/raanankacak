import { NextResponse } from "next/server";
import { z } from "zod";
import { getEventById, updateEvent, deleteEvent } from "@/lib/db/calendar";
import { getProjectById } from "@/lib/db/projects";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";

const patchSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  type: z.enum(["DEADLINE", "DELIVERY", "INSPECTION", "MEETING", "LEAVE", "HOLIDAY"]).optional(),
  title: z.string().min(1).max(200).optional(),
  date: z.string().optional(),
  time: z.string().max(10).nullable().optional(),
  endTime: z.string().max(10).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  location: z.string().max(160).optional(),
  withWho: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember();
    const { id } = await params;
    const existing = await getEventById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Event not found");
    const body = patchSchema.parse(await request.json());
    if (body.projectId) {
      const project = await getProjectById(member.orgId, body.projectId);
      if (!project) throw new ApiError(404, "Project not found");
    }
    const event = await updateEvent(member.orgId, id, body);
    return NextResponse.json({ event });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember();
    const { id } = await params;
    const existing = await getEventById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Event not found");
    await deleteEvent(member.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
