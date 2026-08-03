import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type {
  Equipment,
  EquipmentStatus,
  EquipmentUsageLog,
} from "@/lib/db/types";
import { isUuid } from "@/lib/uuid";

export const DEFAULT_LIST_LIMIT = 200;

function mapEquipment(row: Record<string, unknown>): Equipment {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: (row.project_id as string | null) ?? null,
    code: row.code as string,
    name: row.name as string,
    type: (row.type as string | null) ?? null,
    registrationNo: (row.registration_no as string | null) ?? null,
    owned: row.owned as boolean,
    supplier: (row.supplier as string | null) ?? null,
    status: row.status as EquipmentStatus,
    lastServiceDate: (row.last_service_date as string | null) ?? null,
    nextServiceDate: (row.next_service_date as string | null) ?? null,
    inspectionExpiry: (row.inspection_expiry as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    photos: (row.photos ?? []) as string[],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapLog(row: Record<string, unknown>): EquipmentUsageLog {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    equipmentId: row.equipment_id as string,
    projectId: (row.project_id as string | null) ?? null,
    date: row.date as string,
    // numeric comes back as a string from PostgREST; Number() here rather
    // than at every call site that wants to add it up.
    hours: Number(row.hours ?? 0),
    operatorName: (row.operator_name as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    loggedById: row.logged_by_id as string,
    loggedByName: row.logged_by_name as string,
    createdAt: new Date(row.created_at as string),
  };
}

export interface EquipmentListItem extends Equipment {
  project: { id: string; name: string } | null;
  /** From the equipment_hours view — computed, never stored. */
  totalHours: number;
  lastUsed: string | null;
}

const LIST_COLUMNS =
  "*, project:projects(id, name), hours:equipment_hours(total_hours, last_used)";

function mapListItem(row: Record<string, unknown>): EquipmentListItem {
  // PostgREST returns an embedded view as an array when it cannot prove the
  // relationship is to-one. Handle both rather than guessing which.
  const raw = row.hours;
  const hours = (Array.isArray(raw) ? raw[0] : raw) as
    | { total_hours: string | number | null; last_used: string | null }
    | null
    | undefined;

  return {
    ...mapEquipment(row),
    project: (row.project as { id: string; name: string } | null) ?? null,
    totalHours: Number(hours?.total_hours ?? 0),
    lastUsed: hours?.last_used ?? null,
  };
}

/**
 * The plant register.
 *
 * Ordered by code, which is the reference people say out loud, and the
 * unique-per-workspace column — so it is already a total order and needs no
 * tiebreaker, unlike the date-ordered lists elsewhere in this app.
 */
export async function listEquipmentForOrgViaSession(
  orgId: string,
  {
    projectId,
    status,
    limit = DEFAULT_LIST_LIMIT,
    offset = 0,
  }: {
    projectId?: string;
    status?: EquipmentStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<EquipmentListItem[]> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("equipment")
    .select(LIST_COLUMNS)
    .eq("org_id", orgId)
    .order("code")
    .range(offset, offset + limit - 1);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    mapListItem(row as unknown as Record<string, unknown>),
  );
}

export async function countEquipmentForOrg(
  orgId: string,
  { projectId, status }: { projectId?: string; status?: EquipmentStatus } = {},
): Promise<number> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("equipment")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Machines needing attention: a lapsed statutory inspection or an overdue
 * service, retired plant excluded.
 *
 * Two counts rather than one. A machine overdue a service is a maintenance
 * decision; a machine with an expired inspection certificate must not be
 * operated, and folding them together hides that at the moment it matters.
 */
export async function countEquipmentNeedingAttention(
  orgId: string,
  today: string,
): Promise<{ inspectionExpired: number; serviceOverdue: number }> {
  const supabase = await createSessionClient();

  const base = () =>
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .neq("status", "RETIRED");

  const [inspection, service] = await Promise.all([
    base().not("inspection_expiry", "is", null).lt("inspection_expiry", today),
    base().not("next_service_date", "is", null).lt("next_service_date", today),
  ]);

  if (inspection.error) throw inspection.error;
  if (service.error) throw service.error;
  return {
    inspectionExpired: inspection.count ?? 0,
    serviceOverdue: service.count ?? 0,
  };
}

export async function getEquipmentById(
  orgId: string,
  id: string,
): Promise<Equipment | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("equipment")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapEquipment(data) : null;
}

/** Usage history for one machine, most recent first. */
export async function listUsageLogsForEquipment(
  orgId: string,
  equipmentId: string,
  limit = 100,
): Promise<EquipmentUsageLog[]> {
  if (!isUuid(equipmentId)) return [];
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("equipment_usage_logs")
    .select("*")
    .eq("org_id", orgId)
    .eq("equipment_id", equipmentId)
    .order("date", { ascending: false })
    // date ties whenever a machine is logged twice in a day, and an offset
    // into a non-total order repeats rows.
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapLog);
}

/**
 * Total hours for one machine, from the view rather than by summing a
 * fetched page — which would silently under-report past the row cap.
 */
export async function getEquipmentHours(
  orgId: string,
  equipmentId: string,
): Promise<{ totalHours: number; lastUsed: string | null; logCount: number }> {
  if (!isUuid(equipmentId))
    return { totalHours: 0, lastUsed: null, logCount: 0 };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("equipment_hours")
    .select("total_hours, last_used, log_count")
    .eq("equipment_id", equipmentId)
    .maybeSingle();
  if (error) throw error;
  return {
    totalHours: Number(data?.total_hours ?? 0),
    lastUsed: (data?.last_used as string | null) ?? null,
    logCount: Number(data?.log_count ?? 0),
  };
}

async function nextCode(orgId: string): Promise<string> {
  const { count, error } = await createAdminClient()
    .from("equipment")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return "EQ-" + String((count ?? 0) + 1).padStart(3, "0");
}

export async function createEquipment(
  orgId: string,
  input: {
    name: string;
    type?: string;
    registrationNo?: string;
    projectId?: string | null;
    owned: boolean;
    supplier?: string;
    status?: EquipmentStatus;
    lastServiceDate?: string;
    nextServiceDate?: string;
    inspectionExpiry?: string;
    notes?: string;
    photos?: string[];
  },
): Promise<Equipment> {
  const code = await nextCode(orgId);
  const { data, error } = await createAdminClient()
    .from("equipment")
    .insert({
      org_id: orgId,
      code,
      name: input.name,
      type: input.type ?? null,
      registration_no: input.registrationNo ?? null,
      project_id: input.projectId ?? null,
      owned: input.owned,
      supplier: input.supplier ?? null,
      status: input.status ?? "ACTIVE",
      last_service_date: input.lastServiceDate ?? null,
      next_service_date: input.nextServiceDate ?? null,
      inspection_expiry: input.inspectionExpiry ?? null,
      notes: input.notes ?? null,
      photos: input.photos ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapEquipment(data);
}

export async function updateEquipment(
  orgId: string,
  id: string,
  input: Partial<{
    name: string;
    type: string | null;
    registrationNo: string | null;
    projectId: string | null;
    owned: boolean;
    supplier: string | null;
    status: EquipmentStatus;
    lastServiceDate: string | null;
    nextServiceDate: string | null;
    inspectionExpiry: string | null;
    notes: string | null;
    photos: string[];
  }>,
): Promise<Equipment | null> {
  if (!isUuid(id)) return null;

  const columns: Record<keyof typeof input, string> = {
    name: "name",
    type: "type",
    registrationNo: "registration_no",
    projectId: "project_id",
    owned: "owned",
    supplier: "supplier",
    status: "status",
    lastServiceDate: "last_service_date",
    nextServiceDate: "next_service_date",
    inspectionExpiry: "inspection_expiry",
    notes: "notes",
    photos: "photos",
  };

  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = input[key as keyof typeof input];
    if (value !== undefined) patch[column] = value;
  }
  if (Object.keys(patch).length === 0) return getEquipmentById(orgId, id);

  const { data, error } = await createAdminClient()
    .from("equipment")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? mapEquipment(data) : null;
}

export async function deleteEquipment(
  orgId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await createAdminClient()
    .from("equipment")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function createUsageLog(
  orgId: string,
  input: {
    equipmentId: string;
    projectId: string | null;
    date: string;
    hours: number;
    operatorName?: string;
    notes?: string;
    loggedById: string;
    loggedByName: string;
  },
): Promise<EquipmentUsageLog> {
  const { data, error } = await createAdminClient()
    .from("equipment_usage_logs")
    .insert({
      org_id: orgId,
      equipment_id: input.equipmentId,
      project_id: input.projectId,
      date: input.date,
      hours: input.hours,
      operator_name: input.operatorName ?? null,
      notes: input.notes ?? null,
      logged_by_id: input.loggedById,
      logged_by_name: input.loggedByName,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapLog(data);
}
