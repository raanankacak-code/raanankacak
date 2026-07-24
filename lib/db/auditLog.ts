import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { AuditAction, AuditLogEntry } from "@/lib/db/types";

function mapAuditLogEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    actorMemberId: row.actor_member_id as string | null,
    actorName: row.actor_name as string,
    action: row.action as AuditAction,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | null,
    summary: row.summary as string,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Appends one compliance-trail entry. audit_log is append-only at the
 * database level (see supabase/schema.sql) — there is no update/delete
 * function here on purpose.
 */
export async function recordAuditEvent(
  orgId: string,
  input: {
    actorMemberId: string | null;
    actorName: string;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await createAdminClient().from("audit_log").insert({
    org_id: orgId,
    actor_member_id: input.actorMemberId,
    actor_name: input.actorName,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? null,
  });
  if (error) throw error;
}

export async function listAuditLogForOrg(orgId: string, limit = 200): Promise<AuditLogEntry[]> {
  const { data, error } = await createAdminClient()
    .from("audit_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapAuditLogEntry);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listAuditLogForOrgViaSession(orgId: string, limit = 200): Promise<AuditLogEntry[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapAuditLogEntry);
}
