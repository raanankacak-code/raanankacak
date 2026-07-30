import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listProjectNamesForOrg } from "@/lib/db/projects";
import { listEquipmentForOrgViaSession, countEquipmentForOrg, DEFAULT_LIST_LIMIT } from "@/lib/db/equipment";
import { EQUIPMENT_STATUSES } from "@/lib/equipment";
import { todayInOrgTimezone } from "@/lib/today";
import EquipmentView from "./EquipmentView";
import type { EquipmentStatus } from "@/lib/db/types";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string; offset?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;
  // Anyone who can see reports can see the plant register — knowing a
  // machine's inspection has lapsed is not privileged information on a site.
  if (!can(member.role, "viewReports")) redirect("/dashboard");

  const { projectId, status: statusParam, offset: offsetParam } = await searchParams;
  const offset = Math.max(0, Number(offsetParam) || 0);
  const status = EQUIPMENT_STATUSES.find((s) => s === statusParam) as EquipmentStatus | undefined;

  const [equipment, projects, total] = await Promise.all([
    listEquipmentForOrgViaSession(member.orgId, { projectId: projectId || undefined, status, offset }),
    listProjectNamesForOrg(member.orgId),
    countEquipmentForOrg(member.orgId, { projectId: projectId || undefined, status }),
  ]);

  return (
    <EquipmentView
      rows={equipment}
      projects={projects}
      total={total}
      offset={offset}
      pageSize={DEFAULT_LIST_LIMIT}
      selectedProjectId={projectId}
      selectedStatus={statusParam}
      today={todayInOrgTimezone()}
      canManage={can(member.role, "manageEquipment")}
      canLogUsage={can(member.role, "logEquipmentUsage")}
    />
  );
}
