import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listProjectNamesForOrg } from "@/lib/db/projects";
import { listMembersForOrgViaSession } from "@/lib/db/team";
import { listDefectsForOrgViaSession, countDefectsForOrg, DEFAULT_LIST_LIMIT } from "@/lib/db/defects";
import { DEFECT_STATUSES } from "@/lib/defects";
import { todayInOrgTimezone } from "@/lib/today";
import DefectsView from "./DefectsView";
import type { DefectStatus } from "@/lib/db/types";

export default async function DefectsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string; offset?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;
  // Viewing matches the safety module: anyone who can see reports can see the
  // snag list. A defect nobody may look at cannot be chased.
  if (!can(member.role, "viewReports")) redirect("/dashboard");

  const { projectId, status: statusParam, offset: offsetParam } = await searchParams;
  const offset = Math.max(0, Number(offsetParam) || 0);
  const status = DEFECT_STATUSES.find((s) => s === statusParam) as DefectStatus | undefined;

  const [defects, projects, members, total] = await Promise.all([
    listDefectsForOrgViaSession(member.orgId, { projectId: projectId || undefined, status, offset }),
    listProjectNamesForOrg(member.orgId),
    listMembersForOrgViaSession(member.orgId),
    countDefectsForOrg(member.orgId, { projectId: projectId || undefined, status }),
  ]);

  return (
    <DefectsView
      rows={defects}
      projects={projects}
      // Only active members can be assigned work. Offering someone who has
      // left is how a defect sits unactioned for a month.
      members={members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
      total={total}
      offset={offset}
      pageSize={DEFAULT_LIST_LIMIT}
      selectedProjectId={projectId}
      selectedStatus={statusParam}
      today={todayInOrgTimezone()}
      canRaise={can(member.role, "raiseDefects")}
      canClose={can(member.role, "closeDefects")}
    />
  );
}
