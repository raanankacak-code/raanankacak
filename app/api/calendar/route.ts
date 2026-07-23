import { NextResponse } from "next/server";
import { z } from "zod";
import { listEventsForOrg, createEvent } from "@/lib/db/calendar";
import { getProjectById } from "@/lib/db/projects";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const events = await listEventsForOrg(member.orgId, from && to ? { from, to } : undefined);
    return NextResponse.json({ events });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const createSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  type: z.enum(["DEADLINE", "DELIVERY", "INSPECTION", "MEETING", "LEAVE", "HOLIDAY"]),
  title: z.string().min(1).max(200),
  date: z.string(),
  time: z.string().max(10).optional(),
  endTime: z.string().max(10).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  location: z.string().max(160).optional(),
  withWho: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember();
    const body = createSchema.parse(await request.json());
    if (body.projectId) {
      const project = await getProjectById(member.orgId, body.projectId);
      if (!project) throw new ApiError(404, "Project not found");
    }
    const event = await createEvent(member.orgId, { ...body, createdByName: member.name });
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
