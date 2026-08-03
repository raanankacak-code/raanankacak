import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type {
  CalendarEvent,
  CalendarEventPriority,
  CalendarEventStatus,
  CalendarEventType,
} from "@/lib/db/types";
import { isUuid } from "@/lib/uuid";
import { fetchAllRows } from "@/lib/db/paging";

function mapEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string | null,
    type: row.type as CalendarEventType,
    title: row.title as string,
    date: row.date as string,
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
  let query = createAdminClient()
    .from("calendar_events")
    .select("*")
    .eq("org_id", orgId);
  if (range) query = query.gte("date", range.from).lte("date", range.to);
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    query.order("date", { ascending: true }).range(from, to),
  );
  return data.map(mapEvent);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listEventsForOrgViaSession(
  orgId: string,
  range?: { from: string; to: string },
): Promise<CalendarEvent[]> {
  const supabase = await createSessionClient();
  let query = supabase.from("calendar_events").select("*").eq("org_id", orgId);
  if (range) query = query.gte("date", range.from).lte("date", range.to);
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    query.order("date", { ascending: true }).range(from, to),
  );
  return data.map(mapEvent);
}

export async function getEventById(
  orgId: string,
  id: string,
): Promise<CalendarEvent | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
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
  const { error } = await createAdminClient()
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}
