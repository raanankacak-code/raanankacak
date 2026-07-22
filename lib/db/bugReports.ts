import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BugReport } from "@/lib/db/types";

function mapBugReport(row: Record<string, unknown>): BugReport {
  return {
    id: row.id as string,
    ref: row.ref as string,
    orgId: row.org_id as string,
    reportedByUserId: row.reported_by_user_id as string,
    reportedByName: row.reported_by_name as string,
    reportedByEmail: row.reported_by_email as string,
    area: row.area as string,
    severity: row.severity as string,
    description: row.description as string,
    steps: row.steps as string | null,
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
  };
}

function genRef() {
  return "BUG-" + randomBytes(3).toString("hex").toUpperCase();
}

export async function createBugReport(
  orgId: string,
  input: {
    reportedByUserId: string;
    reportedByName: string;
    reportedByEmail: string;
    area: string;
    severity: string;
    description: string;
    steps?: string;
  },
): Promise<BugReport> {
  const { data, error } = await createAdminClient()
    .from("bug_reports")
    .insert({
      ref: genRef(),
      org_id: orgId,
      reported_by_user_id: input.reportedByUserId,
      reported_by_name: input.reportedByName,
      reported_by_email: input.reportedByEmail,
      area: input.area,
      severity: input.severity,
      description: input.description,
      steps: input.steps || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapBugReport(data);
}

export async function listBugReportsForOrg(orgId: string): Promise<BugReport[]> {
  const { data, error } = await createAdminClient()
    .from("bug_reports")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapBugReport);
}
