import { createAdminClient } from "@/lib/supabase/admin";
import { UPLOADS_BUCKET } from "@/lib/uploads";

export interface DeletedWorkspace {
  id: string;
  orgId: string;
  orgName: string;
  deletedByUserId: string;
  deletedByEmail: string;
  deletedByName: string;
  deletedAt: Date;
  plan: string | null;
  memberCount: number;
  projectCount: number;
  workerCount: number;
  reportCount: number;
  storageObjectCount: number;
  storageBytes: number;
}

/** What was in the workspace, counted just before it stops existing. */
export interface WorkspaceContents {
  memberCount: number;
  projectCount: number;
  workerCount: number;
  reportCount: number;
  storageObjectCount: number;
  storageBytes: number;
}

/**
 * Counts, without reading a single row of content.
 *
 * `head: true` asks PostgREST for the count and no rows at all, which
 * matters here: a workspace being deleted may hold tens of thousands of
 * attendance records, and this runs while the user waits.
 */
export async function countWorkspaceContents(orgId: string): Promise<WorkspaceContents> {
  const supabase = createAdminClient();

  async function count(table: string): Promise<number> {
    const { count: n, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
    return n ?? 0;
  }

  const [memberCount, projectCount, workerCount, reportCount] = await Promise.all([
    count("org_members"),
    count("projects"),
    count("workers"),
    count("daily_reports"),
  ]);

  // Storage is listed rather than counted, because the bucket has no row to
  // count. Paged, since list() caps at 100 by default and a silent cap is
  // how a number ends up wrong but plausible.
  const storage = supabase.storage.from(UPLOADS_BUCKET);
  const PAGE = 100;
  let offset = 0;
  let storageObjectCount = 0;
  let storageBytes = 0;
  for (;;) {
    const { data, error } = await storage.list(orgId, { limit: PAGE, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const object of data) {
      storageObjectCount += 1;
      storageBytes += (object.metadata?.size as number | undefined) ?? 0;
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return { memberCount, projectCount, workerCount, reportCount, storageObjectCount, storageBytes };
}

/**
 * Records that a workspace was deleted.
 *
 * Written *before* the deletion runs, not after. If it were written
 * afterwards and the process died in between, the workspace would be gone
 * with no record of who removed it — which is the exact hole this exists to
 * close. Recording a deletion that then fails leaves a row describing a
 * workspace that still exists; that is a discrepancy someone can notice and
 * resolve, whereas a missing record is not.
 *
 * Service role only: deleted_workspaces has RLS on and no policies, so
 * nothing holding a user session can read or write it.
 */
export async function recordWorkspaceDeletion(input: {
  orgId: string;
  orgName: string;
  deletedByUserId: string;
  deletedByEmail: string;
  deletedByName: string;
  plan: string | null;
  contents: WorkspaceContents;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from("deleted_workspaces")
    .upsert(
      {
        org_id: input.orgId,
        org_name: input.orgName,
        deleted_by_user_id: input.deletedByUserId,
        deleted_by_email: input.deletedByEmail,
        deleted_by_name: input.deletedByName,
        plan: input.plan,
        member_count: input.contents.memberCount,
        project_count: input.contents.projectCount,
        worker_count: input.contents.workerCount,
        report_count: input.contents.reportCount,
        storage_object_count: input.contents.storageObjectCount,
        storage_bytes: input.contents.storageBytes,
      },
      // A retry after a failed deletion must not collide with the row the
      // first attempt already wrote.
      { onConflict: "org_id" },
    );

  if (error) throw new Error(`Failed to record workspace deletion: ${error.message}`);
}

/** Operator-side lookup. There is no UI for this and deliberately so. */
export async function findDeletedWorkspace(orgId: string): Promise<DeletedWorkspace | null> {
  const { data, error } = await createAdminClient()
    .from("deleted_workspaces")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load deleted workspace: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id as string,
    orgId: data.org_id as string,
    orgName: data.org_name as string,
    deletedByUserId: data.deleted_by_user_id as string,
    deletedByEmail: data.deleted_by_email as string,
    deletedByName: data.deleted_by_name as string,
    deletedAt: new Date(data.deleted_at as string),
    plan: (data.plan as string | null) ?? null,
    memberCount: data.member_count as number,
    projectCount: data.project_count as number,
    workerCount: data.worker_count as number,
    reportCount: data.report_count as number,
    storageObjectCount: data.storage_object_count as number,
    storageBytes: data.storage_bytes as number,
  };
}
