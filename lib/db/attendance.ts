import { createAdminClient } from "@/lib/supabase/admin";
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
