import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/lib/db/types";

function mapNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    type: row.type as string,
    title: row.title as string,
    description: row.description as string | null,
    read: row.read as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

export async function listNotificationsForOrg(
  orgId: string,
  limit = 50,
): Promise<AppNotification[]> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapNotification);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listNotificationsForOrgViaSession(
  orgId: string,
  limit = 50,
): Promise<AppNotification[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapNotification);
}

export async function countUnread(orgId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function notify(
  orgId: string,
  type: string,
  title: string,
  description?: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .insert({ org_id: orgId, type, title, description });
  if (error) throw error;
}

export async function markRead(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}

export async function markAllRead(orgId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .update({ read: true })
    .eq("org_id", orgId)
    .eq("read", false);
  if (error) throw error;
}

export async function deleteNotification(
  orgId: string,
  id: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}
