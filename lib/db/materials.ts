import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { MaterialRequest, MaterialRequestEvent, MaterialRequestStatus, MaterialRequestWithTimeline } from "@/lib/db/types";

function mapRequest(row: Record<string, unknown>): MaterialRequest {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    code: row.code as string,
    material: row.material as string,
    qty: Number(row.qty),
    unit: row.unit as string,
    neededBy: row.needed_by ? new Date(row.needed_by as string) : null,
    justification: row.justification as string | null,
    status: row.status as MaterialRequestStatus,
    receivedQty: row.received_qty === null || row.received_qty === undefined ? null : Number(row.received_qty),
    requestedById: row.requested_by_id as string,
    requestedByName: row.requested_by_name as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapEvent(row: Record<string, unknown>): MaterialRequestEvent {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    state: row.state as MaterialRequestStatus,
    comment: row.comment as string | null,
    actorName: row.actor_name as string,
    createdAt: new Date(row.created_at as string),
  };
}

export async function listRequestsForOrg(
  orgId: string,
): Promise<(MaterialRequest & { project: { id: string; name: string } })[]> {
  const { data, error } = await createAdminClient()
    .from("material_requests")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...mapRequest(row),
    project: row.project as { id: string; name: string },
  }));
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listRequestsForOrgViaSession(
  orgId: string,
): Promise<(MaterialRequest & { project: { id: string; name: string } })[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...mapRequest(row),
    project: row.project as { id: string; name: string },
  }));
}

export async function listRequestsForProject(projectId: string): Promise<MaterialRequest[]> {
  const { data, error } = await createAdminClient()
    .from("material_requests")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

export async function getRequestById(orgId: string, id: string): Promise<MaterialRequestWithTimeline | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select("*, project:projects(id, name)")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: events, error: evError } = await supabase
    .from("material_request_events")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  if (evError) throw evError;

  return {
    ...mapRequest(data),
    project: data.project as { id: string; name: string },
    timeline: (events ?? []).map(mapEvent),
  };
}

async function nextCode(orgId: string): Promise<string> {
  const { count, error } = await createAdminClient()
    .from("material_requests")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return "MR-" + String((count ?? 0) + 1).padStart(3, "0");
}

export async function createRequest(
  orgId: string,
  input: {
    projectId: string;
    material: string;
    qty: number;
    unit: string;
    neededBy?: string;
    justification?: string;
    status?: MaterialRequestStatus;
    requestedById: string;
    requestedByName: string;
  },
): Promise<MaterialRequest> {
  const supabase = createAdminClient();
  const code = await nextCode(orgId);
  const status = input.status ?? "SUBMITTED";
  const { data, error } = await supabase
    .from("material_requests")
    .insert({
      org_id: orgId,
      project_id: input.projectId,
      code,
      material: input.material,
      qty: input.qty,
      unit: input.unit,
      needed_by: input.neededBy || null,
      justification: input.justification,
      status,
      requested_by_id: input.requestedById,
      requested_by_name: input.requestedByName,
    })
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("material_request_events").insert({
    request_id: data.id,
    state: status,
    actor_name: input.requestedByName,
  });

  return mapRequest(data);
}

export async function transitionRequest(
  orgId: string,
  id: string,
  input: { status: MaterialRequestStatus; comment?: string; actorName: string; receivedQty?: number },
): Promise<MaterialRequest> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("material_requests")
    .update({
      status: input.status,
      received_qty: input.receivedQty,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("material_request_events").insert({
    request_id: id,
    state: input.status,
    comment: input.comment,
    actor_name: input.actorName,
  });

  return mapRequest(data);
}

export async function deleteRequest(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient().from("material_requests").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}
