import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/db/types";

function mapAttendanceRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    workerId: row.worker_id as string,
    date: new Date(row.date as string),
    status: row.status as AttendanceStatus,
    timeIn: row.time_in as string | null,
    timeOut: row.time_out as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listAttendanceForOrgDate(orgId: string, date: string): Promise<AttendanceRecord[]> {
  const { data, error } = await createAdminClient()
    .from("attendance_records")
    .select("*")
    .eq("org_id", orgId)
    .eq("date", date);
  if (error) throw error;
  return (data ?? []).map(mapAttendanceRecord);
}

export async function listAttendanceForProjectDate(projectId: string, date: string): Promise<AttendanceRecord[]> {
  const { data, error } = await createAdminClient()
    .from("attendance_records")
    .select("*")
    .eq("project_id", projectId)
    .eq("date", date);
  if (error) throw error;
  return (data ?? []).map(mapAttendanceRecord);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listAttendanceForProjectDateViaSession(projectId: string, date: string): Promise<AttendanceRecord[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("project_id", projectId)
    .eq("date", date);
  if (error) throw error;
  return (data ?? []).map(mapAttendanceRecord);
}

/** Per-worker days-worked in a date range, for the monthly attendance summary. */
export async function getDaysWorkedByWorker(
  orgId: string,
  range: { from: string; to: string },
  projectId?: string,
): Promise<Record<string, number>> {
  let query = createAdminClient()
    .from("attendance_records")
    .select("worker_id, status")
    .eq("org_id", orgId)
    .gte("date", range.from)
    .lte("date", range.to)
    .neq("status", "ABSENT");
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;

  const days: Record<string, number> = {};
  for (const row of data ?? []) {
    const workerId = row.worker_id as string;
    const fraction = row.status === "HALF_DAY" ? 0.5 : 1;
    days[workerId] = (days[workerId] ?? 0) + fraction;
  }
  return days;
}

/** Total wages accrued to date across an org's records (present = full day, half-day = 0.5). */
export async function sumLaborCostForOrg(orgId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("attendance_records")
    .select("status, workers(daily_rate)")
    .eq("org_id", orgId)
    .neq("status", "ABSENT");
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => {
    const worker = row.workers as unknown as { daily_rate: number | string | null } | null;
    const rate = worker?.daily_rate ? Number(worker.daily_rate) : 0;
    const fraction = row.status === "HALF_DAY" ? 0.5 : 1;
    return sum + rate * fraction;
  }, 0);
}

/**
 * Per-worker days-worked, all time, for a single project (used by the cost
 * report).
 *
 * Aggregated in the database. Summing a fetched list here would stop at
 * PostgREST's 1000-row cap, and one project-month of a 40-worker crew is
 * already 1000 attendance records — so the figure would quietly come out
 * low, with nothing to show it had.
 */
export async function getDaysWorkedByWorkerForProject(projectId: string): Promise<Record<string, number>> {
  const { data, error } = await createAdminClient().rpc("days_worked_by_worker_for_project", {
    p_project_id: projectId,
  });
  if (error) throw error;

  const days: Record<string, number> = {};
  for (const row of (data ?? []) as { worker_id: string; days: number | string }[]) {
    days[row.worker_id] = Number(row.days);
  }
  return days;
}

/**
 * Total wages accrued to date for a single project.
 *
 * Summed in the database, for the same reason as above — this one is a
 * money figure on a cost report, and understating cost is the wrong way to
 * be wrong.
 */
export async function sumLaborCostForProject(projectId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("labor_cost_for_project", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function upsertAttendanceRecords(
  orgId: string,
  projectId: string,
  date: string,
  records: { workerId: string; status: AttendanceStatus; timeIn?: string; timeOut?: string }[],
): Promise<AttendanceRecord[]> {
  const supabase = createAdminClient();

  if (records.length > 0) {
    const { error } = await supabase.from("attendance_records").upsert(
      records.map((r) => ({
        org_id: orgId,
        project_id: projectId,
        worker_id: r.workerId,
        date,
        status: r.status,
        time_in: r.timeIn,
        time_out: r.timeOut,
      })),
      { onConflict: "worker_id,date" },
    );
    if (error) throw error;
  }

  return listAttendanceForProjectDate(projectId, date);
}
