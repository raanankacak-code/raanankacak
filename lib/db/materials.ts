import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { MaterialRequest, MaterialRequestEvent, MaterialRequestStatus, MaterialRequestWithTimeline } from "@/lib/db/types";
import { DEFAULT_LIST_LIMIT } from "@/lib/db/reports";

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
/** Most recent requests first, capped — see DEFAULT_LIST_LIMIT in reports.ts. */
export async function listRequestsForOrgViaSession(
  orgId: string,
  limit: number = DEFAULT_LIST_LIMIT,
): Promise<(MaterialRequest & { project: { id: string; name: string } })[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select("*, project:projects(id, name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...mapRequest(row),
    project: row.project as { id: string; name: string },
  }));
}

/**
 * Counts requests per status without fetching a single row.
 *
 * The dashboard, the sidebar badge and the cost report all used to fetch the
 * whole list and count it in JavaScript. PostgREST caps an unbounded select
 * at 1000 rows and reports no error when it does, so past that point those
 * numbers silently under-reported — a contractor with 3000 requests could be
 * shown 12 pending approvals when they had 40. Counting in the database is
 * both correct at any size and far cheaper.
 */
export async function countRequestsByStatusForOrg(
  orgId: string,
): Promise<Record<MaterialRequestStatus, number>> {
  const supabase = await createSessionClient();
  const statuses: MaterialRequestStatus[] = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "REJECTED",
    "ORDERED",
    "DELIVERED",
  ];

  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("material_requests")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(results) as Record<MaterialRequestStatus, number>;
}

/** Requests needed within `throughDate` that are still outstanding. */
export async function countUrgentRequestsForOrg(orgId: string, throughDate: string): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("material_requests")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .lte("needed_by", throughDate)
    .not("status", "in", "(DELIVERED,REJECTED)");
  if (error) throw error;
  return count ?? 0;
}

/** Per-project counts for the cost report, so its figures stay right at any size. */
export async function countRequestsByStatusForProject(
  projectId: string,
): Promise<Record<MaterialRequestStatus, number>> {
  const supabase = createAdminClient();
  const statuses: MaterialRequestStatus[] = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "REJECTED",
    "ORDERED",
    "DELIVERED",
  ];
  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("material_requests")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<MaterialRequestStatus, number>;
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

/** Total requests in the org, for telling the user how much a capped list is hiding. */
export async function countRequestsForOrg(orgId: string): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("material_requests")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return count ?? 0;
}
