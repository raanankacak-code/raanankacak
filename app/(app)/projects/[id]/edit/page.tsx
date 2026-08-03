import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProjectById } from "@/lib/db/projects";
import EditProjectForm from "./EditProjectForm";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { id } = await params;
  const project = await getProjectById(member.orgId, id);
  if (!project) notFound();
  // The Edit button on the project page is gated on this; the page was not.
  if (!can(member.role, "manageProjects")) redirect(`/projects/${id}`);

  return (
    <>
      <div className="topbar">
        <h2>Edit project</h2>
      </div>
      <div className="card">
        <div className="card-b">
          <EditProjectForm
            project={{
              id: project.id,
              name: project.name,
              client: project.client ?? "",
              siteAddress: project.siteAddress ?? "",
              contractValue: project.contractValue ? Number(project.contractValue) : undefined,
              startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : "",
              endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : "",
              status: project.status,
              progressPct: project.progressPct,
              plannedPct: project.plannedPct,
              managerName: project.managerName ?? "",
            }}
          />
        </div>
      </div>
    </>
  );
}
