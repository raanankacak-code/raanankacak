import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { listProjectsForOrgViaSession } from "@/lib/db/projects";
import { can } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import ProjectsView from "./ProjectsView";

export default async function ProjectsPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const [org, projects] = await Promise.all([
    getOrganizationById(member.orgId),
    listProjectsForOrgViaSession(member.orgId),
  ]);

  const totalValue = projects.reduce((s, p) => s + (p.contractValue ? Number(p.contractValue) : 0), 0);

  const rows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    siteAddress: p.siteAddress,
    client: p.client,
    contractValue: p.contractValue,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    endDate: p.endDate ? p.endDate.toISOString() : null,
    progressPct: p.progressPct,
    status: p.status,
    workerCount: p._count.workers,
  }));

  return (
    <ProjectsView
      rows={rows}
      canEdit={can(member.role, "manageProjects")}
      canDelete={can(member.role, "deleteProjects")}
      summary={`${org?.name} — ${projects.length} project${projects.length === 1 ? "" : "s"}, ${formatCurrency(totalValue)} total contract value. Click a project to open it.`}
    />
  );
}
