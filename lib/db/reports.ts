import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { DailyReport, DailyReportWithProject, ReportStatus } from "@/lib/db/types";

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

function mapDailyReportWithProject(row: Record<string, unknown>): DailyReportWithProject {
  const { project, ...rest } = row as Record<string, unknown> & { project: { id: string; name: string } };
  return { ...mapDailyReport(rest), project };
}

export async function listReports(
  orgId: string,
  filters: { projectId?: string; from?: string; to?: string } = {},
): Promise<DailyReportWithProject[]> {
  let query = createAdminClient()
    .from("daily_reports")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("date", { ascending: false });
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapDailyReportWithProject);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
/**
 * Most recent reports first, capped.
 *
 * The cap is explicit on purpose. An unbounded select is silently truncated
 * at 1000 rows by PostgREST with no error, so a workspace with more than
 * that was quietly shown a subset with no way to tell. Asking for a known
 * number, and counting separately, means the UI can say what it is showing.
 */
export async function listReportsViaSession(
  orgId: string,
  filters: { projectId?: string; from?: string; to?: string; limit?: number } = {},
): Promise<DailyReportWithProject[]> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("daily_reports")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("date", { ascending: false })
    .limit(filters.limit ?? DEFAULT_LIST_LIMIT);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapDailyReportWithProject);
}

export async function listRecentReportsForOrg(orgId: string, limit: number): Promise<DailyReportWithProject[]> {
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapDailyReportWithProject);
}

export async function getReportById(orgId: string, id: string): Promise<DailyReportWithProject | null> {
  const { data, error } = await createAdminClient()
    .from("daily_reports")
    .select("*, project:projects(id, name)")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDailyReportWithProject(data) : null;
}

export async function getLatestReportForProject(projectId: string): Promise<DailyReport | null> {
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

export async function countReportsForProject(projectId: string): Promise<number> {
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

export async function updateReportStatus(orgId: string, id: string, status: ReportStatus): Promise<DailyReport> {
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
  const { error } = await createAdminClient().from("daily_reports").delete().eq("id", id).eq("org_id", orgId);
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
