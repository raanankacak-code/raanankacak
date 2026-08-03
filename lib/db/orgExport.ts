import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/db/paging";

/**
 * A complete, machine-readable copy of one organisation's data.
 *
 * The Billing page tells customers "All data is safe and can still be viewed
 * and exported" when a trial lapses — this is what makes that true. It is
 * also what someone needs to leave for another system, or to answer a data
 * request.
 *
 * Every query is filtered by org_id (and material_request_events by its
 * parent's org), so an export can only ever contain the caller's own
 * tenant's rows.
 */

export interface OrgExport {
  exportedAt: string;
  formatVersion: number;
  organization: Record<string, unknown> | null;
  members: Record<string, unknown>[];
  invites: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  projectAccess: Record<string, unknown>[];
  projectApprovals: Record<string, unknown>[];
  workers: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  dailyReports: Record<string, unknown>[];
  materialRequests: Record<string, unknown>[];
  materialRequestEvents: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  safetyInspections: Record<string, unknown>[];
  defects: Record<string, unknown>[];
  equipment: Record<string, unknown>[];
  equipmentUsageLogs: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  bugReports: Record<string, unknown>[];
  auditLog: Record<string, unknown>[];
  subscription: Record<string, unknown> | null;
}

/**
 * A pending invite's token is a bearer credential: anyone holding it can
 * join the workspace as the invited role. An export is a file that gets
 * emailed around and dropped in shared drives, so the token must not travel
 * in it — the rest of the invite is still useful as a record.
 */
function redactInvite(
  invite: Record<string, unknown>,
): Record<string, unknown> {
  const { token, ...rest } = invite;
  void token;
  return { ...rest, token: "[redacted]" };
}

export async function buildOrgExport(orgId: string): Promise<OrgExport> {
  const supabase = createAdminClient();

  const byOrg = (table: string) =>
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from(table)
        .select("*")
        .eq("org_id", orgId)
        .order("id", { ascending: true })
        .range(from, to),
    );

  const [
    organization,
    members,
    invites,
    projects,
    projectAccess,
    projectApprovals,
    workers,
    attendance,
    dailyReports,
    materialRequests,
    documents,
    calendarEvents,
    safetyInspections,
    defects,
    equipment,
    equipmentUsageLogs,
    notifications,
    bugReports,
    auditLog,
    subscription,
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).maybeSingle(),
    byOrg("org_members"),
    byOrg("org_invites"),
    byOrg("projects"),
    byOrg("project_access"),
    byOrg("project_approvals"),
    byOrg("workers"),
    byOrg("attendance_records"),
    byOrg("daily_reports"),
    byOrg("material_requests"),
    byOrg("documents"),
    byOrg("calendar_events"),
    byOrg("safety_inspections"),
    byOrg("defects"),
    byOrg("equipment"),
    byOrg("equipment_usage_logs"),
    byOrg("notifications"),
    byOrg("bug_reports"),
    byOrg("audit_log"),
    supabase
      .from("org_subscriptions")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  // Never hand back a partial export that looks complete — a customer
  // migrating away would silently lose whatever failed. The paged reads
  // above throw on error themselves; these two are single-row.
  for (const result of [organization, subscription]) {
    if (result.error) throw result.error;
  }

  // material_request_events has no org_id of its own; it hangs off the
  // request, so scope it through the ids we just fetched. Chunked: `in()`
  // goes into the URL, and a workspace with thousands of requests would
  // otherwise build a query string long enough to be rejected outright.
  const requestIds = materialRequests.map((r) => r.id as string);
  const ID_CHUNK = 200;
  const materialRequestEvents: Record<string, unknown>[] = [];
  for (let i = 0; i < requestIds.length; i += ID_CHUNK) {
    const chunk = requestIds.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("material_request_events")
        .select("*")
        .in("request_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    materialRequestEvents.push(...rows);
  }

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    organization: organization.data ?? null,
    members,
    invites: invites.map(redactInvite),
    projects,
    // Who outside the company was given sight of which project — part of the
    // record, and the thing a customer would need to rebuild it elsewhere.
    projectAccess,
    // What the client signed off, and when. The part of the record a
    // customer migrating away would most want to keep.
    projectApprovals,
    workers,
    attendance,
    dailyReports,
    materialRequests,
    materialRequestEvents,
    documents,
    calendarEvents,
    safetyInspections,
    defects,
    equipment,
    equipmentUsageLogs,
    notifications,
    bugReports,
    auditLog,
    subscription: subscription.data ?? null,
  };
}
