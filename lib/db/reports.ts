import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type {
  DailyReport,
  DailyReportWithProject,
  ReportStatus,
} from "@/lib/db/types";
import { isUuid } from "@/lib/uuid";
import { fetchAllRows } from "@/lib/db/paging";

/**
 * How many rows a list screen asks for. Comfortably more than anyone scrolls
 * in one sitting, and far below PostgREST's silent 1000-row ceiling so the
 * cap is ours and is known.
 */
export const DEFAULT_LIST_LIMIT = 200;

function mapDailyReport(row: Record<string, unknown>): DailyReport {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    date: new Date(row.date as string),
    weather: row.weather as string | null,
    manpower: row.manpower as Record<string, number> | null,
    workCompleted: row.work_completed as string | null,
    delays: row.delays as string | null,
    notes: row.notes as string | null,
    photos: row.photos as string[] | null,
    status: row.status as ReportStatus,
    submittedById: row.submitted_by_id as string,
    submittedByName: row.submitted_by_name as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapDailyReportWithProject(
  row: Record<string, unknown>,
): DailyReportWithProject {
  const { project, ...rest } = row as Record<string, unknown> & {
    project: { id: string; name: string };
  };
  return { ...mapDailyReport(rest), project };
}

/**
 * What a report looks like in a list, as opposed to on its detail screen.
 *
 * A separate type rather than a partial DailyReport, for the same reason as
 * MaterialRequestListItem: the list query does not select manpower, photos,
 * delays or notes, and a type claiming them would be a lie the compiler
 * happily accepts and the runtime does not. Those four are the bulk of a
 * report's bytes and none of them are rendered in a list.
 */
export interface DailyReportListItem {
  id: string;
  projectId: string;
  date: Date;
  weather: string | null;
  workCompleted: string | null;
  status: ReportStatus;
  submittedById: string;
  submittedByName: string;
  project: { id: string; name: string };
}

/** Exactly the columns DailyReportListItem needs, and no more. */
const LIST_COLUMNS =
  "id, project_id, date, weather, work_completed, status, submitted_by_id, submitted_by_name, project:projects(id, name)";

function mapDailyReportListItem(
  row: Record<string, unknown>,
): DailyReportListItem {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    date: new Date(row.date as string),
    weather: row.weather as string | null,
    workCompleted: row.work_completed as string | null,
    status: row.status as ReportStatus,
    submittedById: row.submitted_by_id as string,
    submittedByName: row.submitted_by_name as string,
    project: row.project as { id: string; name: string },
  };
}

/**
 * Every report matching the filters.
 *
 * Paged, and not only so a long project's list is complete: deleting a
 * project reads this to collect the photos to remove from the bucket
 * before the rows cascade away. Stopping at 1000 would strand every photo
 * past that in storage, unreferenced and with nothing left to say whose it
 * was — and would understate the count written to the audit log.
 */
export async function listReports(
  orgId: string,
  filters: { projectId?: string; from?: string; to?: string } = {},
): Promise<DailyReportWithProject[]> {
  const data = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = createAdminClient()
      .from("daily_reports")
      .select("*, project:projects(id, name)")
      .eq("org_id", orgId);
    if (filters.projectId) query = query.eq("project_id", filters.projectId);
    if (filters.from) query = query.gte("date", filters.from);
    if (filters.to) query = query.lte("date", filters.to);
    return query
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  return data.map(mapDailyReportWithProject);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
/**
 * One page of reports, most recent first.
 *
 * The page size is explicit on purpose. An unbounded select is silently
 * truncated at 1000 rows by PostgREST with no error, so a workspace with more
 * than that was quietly shown a subset with no way to tell. Asking for a
 * known number, and counting separately, means the UI can say what it is
 * showing.
 *
 * Sorted by date *and* id. date is a DATE column, so ties are the norm rather
 * than the exception — a busy site files several reports a day — and Postgres
 * orders tied rows arbitrarily. Without the id, page 2 could repeat a row
 * from page 1 and drop another entirely.
 */
export async function listReportsViaSession(
  orgId: string,
  filters: {
    projectId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<DailyReportListItem[]> {
  const supabase = await createSessionClient();
  const limit = filters.limit ?? DEFAULT_LIST_LIMIT;
  const offset = filters.offset ?? 0;
  let query = supabase
    .from("daily_reports")
    .select(LIST_COLUMNS)
    .eq("org_id", orgId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    mapDailyReportListItem(row as unknown as Record<string, unknown>),
  );
}

/**
 * The site diary as a client reads it: what was done, what held it up, and
 * the photographs. Not the internal notes, and not the manpower breakdown.
 *
 * Read through the caller's session, so the SELECT policy is what decides
 * which project's rows come back — this function cannot be talked into
 * another project by a bad id, because it never takes one on trust.
 */
export async function listDiaryForClientViaSession(
  orgId: string,
  projectId: string,
  limit = 30,
): Promise<
  {
    id: string;
    date: Date;
    weather: string | null;
    workCompleted: string | null;
    delays: string | null;
    photos: string[];
  }[]
> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, date, weather, work_completed, delays, photos")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    date: new Date(row.date as string),
    weather: (row.weather as string | null) ?? null,
    workCompleted: (row.work_completed as string | null) ?? null,
    delays: (row.delays as string | null) ?? null,
    photos: ((row.photos ?? []) as string[]) ?? [],
  }));
}

/** Reports in a given status for one project, counted in the database. */
export async function countReportsByStatusForProject(
  projectId: string,
  status: ReportStatus,
): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("daily_reports")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", status);
  if (error) throw error;
  return count ?? 0;
}

export async function listRecentReportsForOrg(
  orgId: string,
  limit: number,
): Promise<DailyReportWithProject[]> {
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapDailyReportWithProject);
}

export async function getReportById(
  orgId: string,
  id: string,
): Promise<DailyReportWithProject | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .select("*, project:projects(id, name)")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDailyReportWithProject(data) : null;
}

export async function getLatestReportForProject(
  projectId: string,
): Promise<DailyReport | null> {
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .select("*")
    .eq("project_id", projectId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDailyReport(data) : null;
}

export async function countReportsForProject(
  projectId: string,
): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("daily_reports")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
}

export async function createReport(
  orgId: string,
  input: {
    projectId: string;
    date: string;
    weather?: string;
    manpower?: Record<string, number>;
    workCompleted?: string;
    delays?: string;
    notes?: string;
    photos?: string[];
    submittedById: string;
    submittedByName: string;
  },
): Promise<DailyReport> {
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .insert({
      org_id: orgId,
      project_id: input.projectId,
      date: input.date,
      weather: input.weather,
      manpower: input.manpower,
      work_completed: input.workCompleted,
      delays: input.delays,
      notes: input.notes,
      photos: input.photos,
      submitted_by_id: input.submittedById,
      submitted_by_name: input.submittedByName,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapDailyReport(data);
}

export async function updateReportStatus(
  orgId: string,
  id: string,
  status: ReportStatus,
): Promise<DailyReport> {
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .update({ status })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapDailyReport(data);
}

export async function deleteReport(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("daily_reports")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}

/** Total matching reports, for telling the user how much a capped list is hiding. */
export async function countReportsForOrg(
  orgId: string,
  filters: { projectId?: string; from?: string; to?: string } = {},
): Promise<number> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("daily_reports")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
