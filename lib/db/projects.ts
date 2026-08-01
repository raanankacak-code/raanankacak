import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Project, ProjectStatus, ProjectWithWorkerCount, ProjectWithWorkers } from "@/lib/db/types";
import { mapWorker } from "@/lib/db/workers";
import { isUuid } from "@/lib/uuid";

function toDate(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}

function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function mapProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    client: row.client as string | null,
    siteAddress: row.site_address as string | null,
    contractValue: toNumber(row.contract_value),
    startDate: toDate(row.start_date),
    endDate: toDate(row.end_date),
    status: row.status as ProjectStatus,
    progressPct: row.progress_pct as number,
    plannedPct: row.planned_pct as number,
    managerName: row.manager_name as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapProjectWithWorkerCount(row: Record<string, unknown>): ProjectWithWorkerCount {
  const workers = row.workers as { count: number }[] | undefined;
  return { ...mapProject(row), _count: { workers: workers?.[0]?.count ?? 0 } };
}

export async function listProjectsForOrg(orgId: string): Promise<ProjectWithWorkerCount[]> {
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("*, workers(count)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProjectWithWorkerCount);
}

/**
 * Tenant-isolation pilot: identical to listProjectsForOrg, but queries
 * through the request's session-bound client (anon key, subject to RLS)
 * instead of the admin client. The .eq("org_id", orgId) filter stays —
 * this is defense in depth, not a replacement for it — but the org_id
 * database column policy (see supabase/schema.sql, "RLS enforcement") is
 * now the thing actually guaranteeing tenant isolation for this query:
 * a bug that dropped the .eq() call here would still only ever return the
 * caller's own org's rows — verified live against the real database with
 * a second throwaway org/user, not just asserted by a mock.
 */
export async function listProjectsForOrgViaSession(orgId: string): Promise<ProjectWithWorkerCount[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, workers(count)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProjectWithWorkerCount);
}

/**
 * Project counts per status, done in the database.
 *
 * Same reason as countRequestsByStatusForOrg: filtering a fetched list is
 * wrong once the list is capped at 1000 rows, and it silently stays wrong.
 */
export async function countProjectsByStatusForOrg(orgId: string): Promise<Record<ProjectStatus, number>> {
  const supabase = await createSessionClient();
  const statuses: ProjectStatus[] = ["PLANNING", "ACTIVE", "COMPLETED", "ON_HOLD"];

  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<ProjectStatus, number>;
}

/** Projects that count against the plan's active-project limit (everything not COMPLETED). */
export async function countActiveProjectsForOrg(orgId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "COMPLETED");
  if (error) throw error;
  return count ?? 0;
}

/**
 * The projects a client may see, read through their own session.
 *
 * No filter by project id here on purpose: the SELECT policy already narrows
 * this to the rows in project_access for this account, so what comes back is
 * the database's answer rather than the application's — if the two ever
 * disagreed, this shows the narrower one. The staff list embeds a worker
 * count; this does not, because a client cannot read the workers table.
 */
export async function listProjectsForClientViaSession(orgId: string): Promise<Project[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProject);
}

/**
 * Of the ids given, the ones that actually belong to this org.
 *
 * Used to check a client invitation before it is created: a project id from
 * another workspace must not become a row in project_access, because the RLS
 * policy would then honour it.
 */
export async function listProjectIdsInOrg(orgId: string, ids: string[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter(isUuid))];
  if (wanted.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .in("id", wanted);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

/** The names behind a set of ids, for a message that has to read like a sentence. */
export async function listProjectNamesByIds(orgId: string, ids: string[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter(isUuid))];
  if (wanted.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("name")
    .eq("org_id", orgId)
    .in("id", wanted)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.name as string);
}

export async function listProjectNamesForOrg(orgId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("id, name")
    .eq("org_id", orgId);
  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(orgId: string, id: string): Promise<Project | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProject(data) : null;
}

export async function getProjectWithWorkers(orgId: string, id: string): Promise<ProjectWithWorkers | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("projects")
    .select("*, workers(*)")
    .eq("id", id)
    .eq("org_id", orgId)
    .order("name", { foreignTable: "workers", ascending: true })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { workers, ...projectRow } = data as Record<string, unknown> & { workers: Record<string, unknown>[] };
  return { ...mapProject(projectRow), workers: workers.map(mapWorker) };
}

export async function createProject(
  orgId: string,
  input: {
    name: string;
    client?: string;
    siteAddress?: string;
    contractValue?: number;
    startDate?: string;
    endDate?: string;
    status?: ProjectStatus;
    managerName?: string;
  },
): Promise<Project> {
  const { data, error } = await createAdminClient()
    .from("projects")
    .insert({
      org_id: orgId,
      name: input.name,
      client: input.client,
      site_address: input.siteAddress,
      contract_value: input.contractValue,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status ?? "PLANNING",
      manager_name: input.managerName,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapProject(data);
}

export async function updateProject(
  orgId: string,
  id: string,
  input: {
    name?: string;
    client?: string;
    siteAddress?: string;
    contractValue?: number;
    startDate?: string;
    endDate?: string;
    status?: ProjectStatus;
    progressPct?: number;
    plannedPct?: number;
    managerName?: string;
  },
): Promise<Project> {
  const { data, error } = await createAdminClient()
    .from("projects")
    .update({
      name: input.name,
      client: input.client,
      site_address: input.siteAddress,
      contract_value: input.contractValue,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status,
      progress_pct: input.progressPct,
      planned_pct: input.plannedPct,
      manager_name: input.managerName,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapProject(data);
}

export async function deleteProject(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient().from("projects").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}
