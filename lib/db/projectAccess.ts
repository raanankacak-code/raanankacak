import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";

/**
 * Which projects a client account may see.
 *
 * The database enforces this too — the SELECT policies in supabase/schema.sql
 * filter a CLIENT to exactly these project ids — so this module is the app's
 * half of the same rule rather than the only copy of it. Both have to agree,
 * and the e2e suite proves the database's half independently by querying it
 * with the client's own JWT.
 */

/**
 * Grants a member access to projects. Idempotent: re-granting an existing
 * pair is a no-op rather than a unique-violation, because "make sure they can
 * see these" is the operation callers actually want.
 */
export async function grantProjectAccess(
  orgId: string,
  memberId: string,
  projectIds: string[],
  grantedByName?: string,
): Promise<void> {
  const ids = [...new Set(projectIds.filter(isUuid))];
  if (ids.length === 0) return;

  const supabase = createAdminClient();

  // Only projects that belong to this org. Passing an id from another
  // workspace must not create a row that the RLS policy would then honour.
  const { data: owned, error: ownedError } = await supabase
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .in("id", ids);
  if (ownedError) throw ownedError;

  const rows = (owned ?? []).map((p) => ({
    org_id: orgId,
    project_id: p.id as string,
    member_id: memberId,
    granted_by_name: grantedByName ?? null,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("project_access").upsert(rows, { onConflict: "project_id,member_id" });
  if (error) throw error;
}

/** Who can see this project from outside the company, and since when. */
export interface ProjectClient {
  memberId: string;
  name: string;
  email: string;
  active: boolean;
  grantedByName: string | null;
  grantedAt: Date;
}

export async function listClientsForProject(orgId: string, projectId: string): Promise<ProjectClient[]> {
  if (!isUuid(projectId)) return [];
  const { data, error } = await createAdminClient()
    .from("project_access")
    .select("member_id, granted_by_name, created_at, member:org_members!inner(id, name, email, active, role)")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const member = row.member as unknown as { name: string; email: string; active: boolean };
    return {
      memberId: row.member_id as string,
      name: member.name,
      email: member.email,
      active: member.active,
      grantedByName: (row.granted_by_name as string | null) ?? null,
      grantedAt: new Date(row.created_at as string),
    };
  });
}

/** Whether anybody outside the company can see this project at all. */
export async function countClientsForProject(orgId: string, projectId: string): Promise<number> {
  if (!isUuid(projectId)) return 0;
  const { count, error } = await createAdminClient()
    .from("project_access")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Takes a client's sight of one project away.
 *
 * Deleting the row rather than flagging it: access is the presence of a row,
 * and a "revoked" flag would be a second thing the policy would have to
 * remember to check. What was signed off stays on the record either way —
 * project_approvals keeps the name and email as they were.
 */
export async function revokeProjectAccess(orgId: string, projectId: string, memberId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("project_access")
    .delete()
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .eq("member_id", memberId);
  if (error) throw error;
}
