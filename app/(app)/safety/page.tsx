import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listProjectNamesForOrg } from "@/lib/db/projects";
import {
  listInspectionsForOrgViaSession,
  countInspectionsForOrg,
  DEFAULT_LIST_LIMIT,
} from "@/lib/db/safety";
import SafetyView from "./SafetyView";

export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; offset?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;
  if (!can(member.role, "viewReports")) redirect("/dashboard");

  const { projectId, offset: offsetParam } = await searchParams;
  const offset = Math.max(0, Number(offsetParam) || 0);

  const [inspections, projects, total] = await Promise.all([
    listInspectionsForOrgViaSession(member.orgId, { projectId: projectId || undefined, offset }),
    listProjectNamesForOrg(member.orgId),
    countInspectionsForOrg(member.orgId, { projectId: projectId || undefined }),
  ]);

  return (
    <SafetyView
      rows={inspections}
      projects={projects}
      total={total}
      offset={offset}
      pageSize={DEFAULT_LIST_LIMIT}
      selectedProjectId={projectId}
      canSubmit={can(member.role, "submitInspections")}
      canClose={can(member.role, "closeInspections")}
    />
  );
}
