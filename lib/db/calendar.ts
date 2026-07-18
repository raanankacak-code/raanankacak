import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CalendarEvent,
  CalendarEventPriority,
  CalendarEventStatus,
  CalendarEventType,
} from "@/lib/db/types";

function mapEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string | null,
    type: row.type as CalendarEventType,
    title: row.title as string,
    date: new Date(row.date as string),
    time: row.time as string | null,
    endTime: row.end_time as string | null,
    priority: row.priority as CalendarEventPriority,
    status: row.status as CalendarEventStatus,
    location: row.location as string | null,
    withWho: row.with_who as string | null,
    description: row.description as string | null,
    createdByName: row.created_by_name as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listEventsForOrg(
  orgId: string,
  range?: { from: string; to: string },
): Promise<CalendarEvent[]> {
  let query = createAdminClient().from("calendar_events").select("*").eq("org_id", orgId);
  if (range) query = query.gte("date", range.from).lte("date", range.to);
  const { data, error } = await query.order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export async function getEventById(orgId: string, id: string): Promise<CalendarEvent | null> {
  const { data, error } = await createAdminClient()
    .from("calendar_events")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapEvent(data) : null;
}

export async function createEvent(
  orgId: string,
  input: {
    projectId?: string | null;
    type: CalendarEventType;
    title: string;
    date: string;
    time?: string;
    endTime?: string;
    priority?: CalendarEventPriority;
    location?: string;
    withWho?: string;
    description?: string;
    createdByName: string;
  },
): Promise<CalendarEvent> {
  const { data, error } = await createAdminClient()
    .from("calendar_events")
    .insert({
      org_id: orgId,
      project_id: input.projectId || null,
      type: input.type,
      title: input.title,
      date: input.date,
      time: input.time || null,
      end_time: input.endTime || null,
      priority: input.priority ?? "MEDIUM",
      location: input.location,
      with_who: input.withWho,
      description: input.description,
      created_by_name: input.createdByName,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapEvent(data);
}

export async function updateEvent(
  orgId: string,
  id: string,
  input: Partial<{
    projectId: string | null;
    type: CalendarEventType;
    title: string;
    date: string;
    time: string | null;
    endTime: string | null;
    priority: CalendarEventPriority;
    status: CalendarEventStatus;
    location: string;
    withWho: string;
    description: string;
  }>,
): Promise<CalendarEvent> {
  const { data, error } = await createAdminClient()
    .from("calendar_events")
    .update({
      project_id: input.projectId,
      type: input.type,
      title: input.title,
      date: input.date,
      time: input.time,
      end_time: input.endTime,
      priority: input.priority,
      status: input.status,
      location: input.location,
      with_who: input.withWho,
      description: input.description,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapEvent(data);
}

export async function deleteEvent(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient().from("calendar_events").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}
