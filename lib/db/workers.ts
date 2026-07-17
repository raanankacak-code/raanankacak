import { createAdminClient } from "@/lib/supabase/admin";
import type { Worker } from "@/lib/db/types";

export function mapWorker(row: Record<string, unknown>): Worker {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    trade: row.trade as string | null,
    dailyRate: row.daily_rate === null || row.daily_rate === undefined ? null : Number(row.daily_rate),
    icNumber: row.ic_number as string | null,
    cidbNumber: row.cidb_number as string | null,
    cidbExpiry: row.cidb_expiry ? new Date(row.cidb_expiry as string) : null,
    active: row.active as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listActiveWorkersForProject(projectId: string): Promise<Worker[]> {
  const { data, error } = await createAdminClient()
    .from("workers")
    .select("*")
    .eq("project_id", projectId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapWorker);
}

export async function countActiveWorkersForOrg(orgId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("workers")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function getWorkerById(orgId: string, id: string): Promise<Worker | null> {
  const { data, error } = await createAdminClient()
    .from("workers")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapWorker(data) : null;
}

export async function createWorker(
  orgId: string,
  projectId: string,
  input: {
    name: string;
    trade?: string;
    dailyRate?: number;
    icNumber?: string;
    cidbNumber?: string;
    cidbExpiry?: string;
  },
): Promise<Worker> {
  const { data, error } = await createAdminClient()
    .from("workers")
    .insert({
      org_id: orgId,
      project_id: projectId,
      name: input.name,
      trade: input.trade,
      daily_rate: input.dailyRate,
      ic_number: input.icNumber,
      cidb_number: input.cidbNumber,
      cidb_expiry: input.cidbExpiry,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapWorker(data);
}

export async function updateWorker(
  orgId: string,
  id: string,
  input: {
    name?: string;
    trade?: string;
    dailyRate?: number;
    icNumber?: string;
    cidbNumber?: string;
    cidbExpiry?: string;
    active?: boolean;
  },
): Promise<Worker> {
  const { data, error } = await createAdminClient()
    .from("workers")
    .update({
      name: input.name,
      trade: input.trade,
      daily_rate: input.dailyRate,
      ic_number: input.icNumber,
      cidb_number: input.cidbNumber,
      cidb_expiry: input.cidbExpiry,
      active: input.active,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapWorker(data);
}

export async function deleteWorker(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient().from("workers").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}
