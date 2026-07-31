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
