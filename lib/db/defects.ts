import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Defect, DefectSeverity, DefectStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/uuid";

/** One page of the list, matching the cap used by reports, materials and safety. */
export const DEFAULT_LIST_LIMIT = 200;

function mapDefect(row: Record<string, unknown>): Defect {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    code: row.code as string,
    title: row.title as string,
    location: (row.location as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    severity: row.severity as DefectSeverity,
    status: row.status as DefectStatus,
    raisedById: row.raised_by_id as string,
    raisedByName: row.raised_by_name as string,
    assignedToId: (row.assigned_to_id as string | null) ?? null,
    assignedToName: (row.assigned_to_name as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    photos: (row.photos ?? []) as string[],
    resolutionNotes: (row.resolution_notes as string | null) ?? null,
    resolutionPhotos: (row.resolution_photos ?? []) as string[],
    closedAt: row.closed_at ? new Date(row.closed_at as string) : null,
    closedByName: (row.closed_by_name as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * What a defect looks like in a list.
 *
 * A separate type for the same reason as SafetyInspectionListItem: the list
 * does not select `description`, `photos` or `resolution_photos`, which are
 * the bulky columns. The detail view fetches the whole record.
 */
export interface DefectListItem {
  id: string;
  code: string;
  projectId: string;
  title: string;
  location: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  assignedToName: string | null;
  dueDate: string | null;
  raisedByName: string;
  createdAt: Date;
  project: { id: string; name: string };
}

const LIST_COLUMNS =
  "id, code, project_id, title, location, severity, status, assigned_to_name, due_date, raised_by_name, created_at, project:projects(id, name)";

function mapListItem(row: Record<string, unknown>): DefectListItem {
  return {
    id: row.id as string,
    code: row.code as string,
    projectId: row.project_id as string,
    title: row.title as string,
    location: (row.location as string | null) ?? null,
    severity: row.severity as DefectSeverity,
    status: row.status as DefectStatus,
    assignedToName: (row.assigned_to_name as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    raisedByName: row.raised_by_name as string,
    createdAt: new Date(row.created_at as string),
    project: row.project as { id: string; name: string },
  };
}

/**
 * One page of defects.
 *
 * Ordered by due date with nulls last, then by id. Two reasons for each half:
 * the soonest deadline is the question a site manager actually asks, and
 * `due_date` is a DATE that many defects will share — an offset into a
 * non-total order hands the same row out on two pages. That bug was found
 * with live data on the materials list and the lesson is applied here rather
 * than relearned.
 */
export async function listDefectsForOrgViaSession(
  orgId: string,
  {
    projectId,
    status,
    limit = DEFAULT_LIST_LIMIT,
    offset = 0,
  }: {
    projectId?: string;
    status?: DefectStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<DefectListItem[]> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("defects")
    .select(LIST_COLUMNS)
    .eq("org_id", orgId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    mapListItem(row as unknown as Record<string, unknown>),
  );
}

export async function countDefectsForOrg(
  orgId: string,
  { projectId, status }: { projectId?: string; status?: DefectStatus } = {},
): Promise<number> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("defects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Outstanding defects — anything not yet closed.
 *
 * RESOLVED is included deliberately: someone has said it is fixed and nobody
 * has agreed yet. See isOutstanding in lib/defects.ts.
 */
export async function countOutstandingDefectsForOrg(
  orgId: string,
): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("defects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "CLOSED");
  if (error) throw error;
  return count ?? 0;
}

/** Outstanding and past its due date, for the dashboard's attention list. */
export async function countOverdueDefectsForOrg(
  orgId: string,
  today: string,
): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("defects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "CLOSED")
    .not("due_date", "is", null)
    .lt("due_date", today);
  if (error) throw error;
  return count ?? 0;
}

/** Per-project counts for the project overview. */
export async function countDefectsForProject(
  orgId: string,
  projectId: string,
  today: string,
): Promise<{ outstanding: number; overdue: number }> {
  const supabase = await createSessionClient();

  const base = () =>
    supabase
      .from("defects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("project_id", projectId)
      .neq("status", "CLOSED");

  const [outstanding, overdue] = await Promise.all([
    base(),
    base().not("due_date", "is", null).lt("due_date", today),
  ]);

  if (outstanding.error) throw outstanding.error;
  if (overdue.error) throw overdue.error;
  return { outstanding: outstanding.count ?? 0, overdue: overdue.count ?? 0 };
}

export async function getDefectById(
  orgId: string,
  id: string,
): Promise<Defect | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("defects")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDefect(data) : null;
}

/** Sequential per-org reference, matching how inspections are numbered. */
async function nextCode(orgId: string): Promise<string> {
  const { count, error } = await createAdminClient()
    .from("defects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return "DF-" + String((count ?? 0) + 1).padStart(3, "0");
}

export async function createDefect(
  orgId: string,
  input: {
    projectId: string;
    title: string;
    location?: string;
    description?: string;
    severity: DefectSeverity;
    assignedToId?: string;
    assignedToName?: string;
    dueDate?: string;
    photos?: string[];
    raisedById: string;
    raisedByName: string;
  },
): Promise<Defect> {
  const code = await nextCode(orgId);

  const { data, error } = await createAdminClient()
    .from("defects")
    .insert({
      org_id: orgId,
      project_id: input.projectId,
      code,
      title: input.title,
      location: input.location ?? null,
      description: input.description ?? null,
      severity: input.severity,
      // Always OPEN on creation. A caller that could set the status could
      // raise a defect already closed, which is a record of nothing.
      status: "OPEN",
      raised_by_id: input.raisedById,
      raised_by_name: input.raisedByName,
      assigned_to_id: input.assignedToId ?? null,
      assigned_to_name: input.assignedToName ?? null,
      due_date: input.dueDate ?? null,
      photos: input.photos ?? [],
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapDefect(data);
}

/**
 * Updates a defect.
 *
 * `closedAt` and `closedByName` are set here rather than accepted from the
 * caller, for the same reason the safety module derives its outcome: the one
 * thing a close-out record has to be is not editable into saying something
 * convenient.
 */
export async function updateDefect(
  orgId: string,
  id: string,
  input: {
    title?: string;
    location?: string | null;
    description?: string | null;
    severity?: DefectSeverity;
    status?: DefectStatus;
    assignedToId?: string | null;
    assignedToName?: string | null;
    dueDate?: string | null;
    photos?: string[];
    resolutionNotes?: string | null;
    resolutionPhotos?: string[];
    closedByName?: string;
  },
): Promise<Defect | null> {
  if (!isUuid(id)) return null;

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.location !== undefined) patch.location = input.location;
  if (input.description !== undefined) patch.description = input.description;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.assignedToId !== undefined)
    patch.assigned_to_id = input.assignedToId;
  if (input.assignedToName !== undefined)
    patch.assigned_to_name = input.assignedToName;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.photos !== undefined) patch.photos = input.photos;
  if (input.resolutionNotes !== undefined)
    patch.resolution_notes = input.resolutionNotes;
  if (input.resolutionPhotos !== undefined)
    patch.resolution_photos = input.resolutionPhotos;

  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "CLOSED") {
      patch.closed_at = new Date().toISOString();
      patch.closed_by_name = input.closedByName ?? null;
    } else {
      // Moving back out of CLOSED is refused upstream by canTransition, but
      // if that ever changes these must not be left describing an event that
      // is no longer true.
      patch.closed_at = null;
      patch.closed_by_name = null;
    }
  }

  const { data, error } = await createAdminClient()
    .from("defects")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? mapDefect(data) : null;
}

export async function deleteDefect(
  orgId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await createAdminClient()
    .from("defects")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
