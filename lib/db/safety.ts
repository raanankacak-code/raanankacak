import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type {
  SafetyInspection,
  SafetyInspectionItem,
  SafetyInspectionOutcome,
  SafetyInspectionStatus,
} from "@/lib/db/types";
import { deriveOutcome } from "@/lib/safety";
import { isUuid } from "@/lib/uuid";
import { fetchAllRows } from "@/lib/db/paging";

/** One page of the list, matching the cap used by reports and materials. */
export const DEFAULT_LIST_LIMIT = 200;

function mapInspection(row: Record<string, unknown>): SafetyInspection {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    code: row.code as string,
    date: row.date as string,
    inspectorId: row.inspector_id as string,
    inspectorName: row.inspector_name as string,
    outcome: row.outcome as SafetyInspectionOutcome,
    status: row.status as SafetyInspectionStatus,
    items: (row.items ?? []) as SafetyInspectionItem[],
    failedCount: Number(row.failed_count ?? 0),
    notes: row.notes as string | null,
    photos: (row.photos ?? []) as string[],
    closedAt: row.closed_at ? new Date(row.closed_at as string) : null,
    closedByName: row.closed_by_name as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * What an inspection looks like in a list.
 *
 * A separate type for the same reason as MaterialRequestListItem: the list
 * query does not select `items`, which is the whole filled-in checklist and
 * by far the largest column. The detail view fetches the full record.
 */
export interface SafetyInspectionListItem {
  id: string;
  code: string;
  projectId: string;
  date: string;
  inspectorName: string;
  outcome: SafetyInspectionOutcome;
  status: SafetyInspectionStatus;
  failedCount: number;
  project: { id: string; name: string };
}

const LIST_COLUMNS =
  "id, code, project_id, date, inspector_name, outcome, status, failed_count, project:projects(id, name)";

function mapListItem(row: Record<string, unknown>): SafetyInspectionListItem {
  return {
    id: row.id as string,
    code: row.code as string,
    projectId: row.project_id as string,
    date: row.date as string,
    inspectorName: row.inspector_name as string,
    outcome: row.outcome as SafetyInspectionOutcome,
    status: row.status as SafetyInspectionStatus,
    failedCount: Number(row.failed_count ?? 0),
    project: row.project as { id: string; name: string },
  };
}

/**
 * One page of inspections, most recent first.
 *
 * Sorted by date *and* id. `date` is a DATE column and a site can be
 * inspected more than once a day, so ties are ordinary — and an offset into a
 * non-total order hands the same row out twice. Same lesson as the materials
 * list, learned there the hard way.
 */
export async function listInspectionsForOrgViaSession(
  orgId: string,
  {
    projectId,
    limit = DEFAULT_LIST_LIMIT,
    offset = 0,
  }: { projectId?: string; limit?: number; offset?: number } = {},
): Promise<SafetyInspectionListItem[]> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("safety_inspections")
    .select(LIST_COLUMNS)
    .eq("org_id", orgId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    mapListItem(row as unknown as Record<string, unknown>),
  );
}

export async function countInspectionsForOrg(
  orgId: string,
  {
    projectId,
    status,
  }: { projectId?: string; status?: SafetyInspectionStatus } = {},
): Promise<number> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("safety_inspections")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Open inspections that found something — the number worth acting on. */
export async function countOpenFindingsForOrg(orgId: string): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("safety_inspections")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "OPEN")
    .gt("failed_count", 0);
  if (error) throw error;
  return count ?? 0;
}

export async function getInspectionById(
  orgId: string,
  id: string,
): Promise<SafetyInspection | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("safety_inspections")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInspection(data) : null;
}

/** Sequential per-org reference, matching how material requests are numbered. */
async function nextCode(orgId: string): Promise<string> {
  const { count, error } = await createAdminClient()
    .from("safety_inspections")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return "SI-" + String((count ?? 0) + 1).padStart(3, "0");
}

export async function createInspection(
  orgId: string,
  input: {
    projectId: string;
    date: string;
    items: SafetyInspectionItem[];
    notes?: string;
    photos?: string[];
    inspectorId: string;
    inspectorName: string;
  },
): Promise<SafetyInspection> {
  const { outcome, failedCount } = deriveOutcome(input.items);
  const code = await nextCode(orgId);

  const { data, error } = await createAdminClient()
    .from("safety_inspections")
    .insert({
      org_id: orgId,
      project_id: input.projectId,
      code,
      date: input.date,
      inspector_id: input.inspectorId,
      inspector_name: input.inspectorName,
      outcome,
      // A clean inspection has nothing to action, so it is closed on arrival.
      status: failedCount === 0 ? "CLOSED" : "OPEN",
      items: input.items,
      failed_count: failedCount,
      notes: input.notes ?? null,
      photos: input.photos ?? [],
      closed_at: failedCount === 0 ? new Date().toISOString() : null,
      closed_by_name: failedCount === 0 ? input.inspectorName : null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapInspection(data);
}

/**
 * Close an inspection once its findings have been actioned.
 *
 * Deliberately the only mutation: the checklist itself is immutable after
 * filing. A record of what was found on site that can be edited afterwards is
 * not evidence of anything.
 */
export async function closeInspection(
  orgId: string,
  id: string,
  closedByName: string,
): Promise<SafetyInspection> {
  const { data, error } = await createAdminClient()
    .from("safety_inspections")
    .update({
      status: "CLOSED",
      closed_at: new Date().toISOString(),
      closed_by_name: closedByName,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapInspection(data);
}

/**
 * Adds evidence to an inspection that has already been filed.
 *
 * Appends rather than replaces, and reads the current array first so two
 * people uploading at once cannot overwrite each other's photographs. The
 * checklist stays sealed either way: this touches `photos` and nothing else,
 * so what was found on site cannot be revised after the fact.
 */
export async function appendInspectionPhotos(
  orgId: string,
  id: string,
  urls: string[],
): Promise<SafetyInspection> {
  const supabase = createAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("safety_inspections")
    .select("photos")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (readError) throw readError;

  const current = ((existing?.photos ?? []) as string[]) ?? [];
  const next = [...current, ...urls.filter((u) => !current.includes(u))];

  const { data, error } = await supabase
    .from("safety_inspections")
    .update({ photos: next })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapInspection(data);
}

/**
 * Takes one photograph back off.
 *
 * Deliberately narrow, and deliberately present: an accidental upload can
 * carry someone's IC number, and "the record is immutable" is not an answer
 * to a PDPA request. Only the roles that can close an inspection may do it,
 * and the audit trail keeps the url of what went.
 */
export async function removeInspectionPhoto(
  orgId: string,
  id: string,
  url: string,
): Promise<SafetyInspection> {
  const supabase = createAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("safety_inspections")
    .select("photos")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();
  if (readError) throw readError;

  const next = (((existing?.photos ?? []) as string[]) ?? []).filter(
    (u) => u !== url,
  );

  const { data, error } = await supabase
    .from("safety_inspections")
    .update({ photos: next })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapInspection(data);
}

export async function deleteInspection(
  orgId: string,
  id: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("safety_inspections")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}

/** For the org export, which takes everything. */
export async function listInspectionsForOrg(
  orgId: string,
): Promise<SafetyInspection[]> {
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    createAdminClient()
      .from("safety_inspections")
      .select("*")
      .eq("org_id", orgId)
      .order("date", { ascending: false })
      .range(from, to),
  );
  return data.map(mapInspection);
}

/** Used by project deletion, which has to collect photos before the cascade. */
export async function listInspectionsForProject(
  orgId: string,
  projectId: string,
): Promise<SafetyInspection[]> {
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    createAdminClient()
      .from("safety_inspections")
      .select("*")
      .eq("org_id", orgId)
      .eq("project_id", projectId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return data.map(mapInspection);
}

/** Open inspections with findings on one project — for its attention card. */
export async function countOpenFindingsForProject(
  orgId: string,
  projectId: string,
): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("safety_inspections")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .eq("status", "OPEN")
    .gt("failed_count", 0);
  if (error) throw error;
  return count ?? 0;
}
