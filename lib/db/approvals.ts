import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { ApprovalStatus, ProjectApproval } from "@/lib/db/types";
import { isUuid } from "@/lib/uuid";

/** One page of the list, matching the cap used by defects, reports and safety. */
export const DEFAULT_LIST_LIMIT = 200;

function mapApproval(row: Record<string, unknown>): ProjectApproval {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    code: row.code as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    photos: ((row.photos ?? []) as string[]) ?? [],
    status: row.status as ApprovalStatus,
    requestedById: row.requested_by_id as string,
    requestedByName: row.requested_by_name as string,
    requestedAt: new Date(row.requested_at as string),
    decidedByMemberId: (row.decided_by_member_id as string | null) ?? null,
    decidedByName: (row.decided_by_name as string | null) ?? null,
    decidedByEmail: (row.decided_by_email as string | null) ?? null,
    decidedAt: row.decided_at ? new Date(row.decided_at as string) : null,
    decisionComment: (row.decision_comment as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** Sequential per-org reference, matching how defects and inspections are numbered. */
async function nextCode(orgId: string): Promise<string> {
  const { count, error } = await createAdminClient()
    .from("project_approvals")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return "AP-" + String((count ?? 0) + 1).padStart(3, "0");
}

export async function createApproval(
  orgId: string,
  input: {
    projectId: string;
    title: string;
    description?: string;
    photos?: string[];
    requestedById: string;
    requestedByName: string;
  },
): Promise<ProjectApproval> {
  const { data, error } = await createAdminClient()
    .from("project_approvals")
    .insert({
      org_id: orgId,
      project_id: input.projectId,
      code: await nextCode(orgId),
      title: input.title,
      description: input.description ?? null,
      photos: input.photos ?? [],
      // Always PENDING. A caller who could set the status could file a
      // request already approved, which is a record of nothing.
      status: "PENDING",
      requested_by_id: input.requestedById,
      requested_by_name: input.requestedByName,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapApproval(data);
}

/**
 * Records the client's decision.
 *
 * The `.eq("status", "PENDING")` is the whole safety of this function: two
 * taps on a slow connection would otherwise write the second decision over
 * the first, and the row would carry a timestamp that never happened. With
 * it, the second update matches no row and the caller gets null — which the
 * route turns into "this has already been decided".
 */
export async function recordDecision(
  orgId: string,
  id: string,
  input: {
    decision: Extract<ApprovalStatus, "APPROVED" | "REJECTED">;
    comment?: string;
    memberId: string;
    memberName: string;
    memberEmail: string;
  },
): Promise<ProjectApproval | null> {
  if (!isUuid(id)) return null;
  const comment = (input.comment ?? "").trim();

  const { data, error } = await createAdminClient()
    .from("project_approvals")
    .update({
      status: input.decision,
      decided_by_member_id: input.memberId,
      // Copied, not joined: this is what the record has to say months later,
      // whatever has happened to the account since.
      decided_by_name: input.memberName,
      decided_by_email: input.memberEmail,
      decided_at: new Date().toISOString(),
      decision_comment: comment.length > 0 ? comment : null,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? mapApproval(data) : null;
}

/** The contractor's way out, and only while the client has not answered. */
export async function withdrawApproval(orgId: string, id: string): Promise<ProjectApproval | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("project_approvals")
    .update({ status: "WITHDRAWN" })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? mapApproval(data) : null;
}

export async function getApprovalById(orgId: string, id: string): Promise<ProjectApproval | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("project_approvals")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapApproval(data) : null;
}

/**
 * Read through the caller's session, so row-level security decides what comes
 * back. That is what makes this one function safe for both sides: staff get
 * their workspace, a client gets their own projects, and neither is a
 * different code path that could drift.
 *
 * Ordered by requested_at *and* id: several requests can be raised in the
 * same second, and a non-total order hands the same row out twice across
 * pages.
 */
export async function listApprovalsViaSession(
  orgId: string,
  {
    projectId,
    status,
    limit = DEFAULT_LIST_LIMIT,
    offset = 0,
  }: { projectId?: string; status?: ApprovalStatus; limit?: number; offset?: number } = {},
): Promise<ProjectApproval[]> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("project_approvals")
    .select("*")
    .eq("org_id", orgId)
    .order("requested_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapApproval(row as Record<string, unknown>));
}

/**
 * One request, read through the caller's session.
 *
 * The portal uses this before writing a decision: if the row belongs to a
 * project this client has no access to, row-level security returns nothing
 * and the route answers 404. The check and the read are the same query, so
 * there is no window between them and no second rule to keep in step.
 */
export async function getApprovalViaSession(orgId: string, id: string): Promise<ProjectApproval | null> {
  if (!isUuid(id)) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("project_approvals")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapApproval(data) : null;
}

/** What is waiting on a client, counted in the database rather than by fetching. */
export async function countPendingApprovalsForOrg(orgId: string): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("project_approvals")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "PENDING");
  if (error) throw error;
  return count ?? 0;
}
