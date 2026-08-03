import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProjectById } from "@/lib/db/projects";
import { getWorkerById } from "@/lib/db/workers";
import EditWorkerForm from "./EditWorkerForm";

export default async function EditWorkerPage({
  params,
}: {
  params: Promise<{ id: string; workerId: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { id: projectId, workerId } = await params;
  const [project, worker] = await Promise.all([
    getProjectById(member.orgId, projectId),
    getWorkerById(member.orgId, workerId),
  ]);
  if (!project || !worker || worker.projectId !== projectId) notFound();
  // The Edit link on the roster is gated on this; the page was not.
  if (!can(member.role, "manageWorkers")) redirect(`/projects/${projectId}?tab=workers`);

  return (
    <>
      <div className="topbar">
        <h2>Edit worker</h2>
      </div>
      <div className="card">
        <div className="card-b">
          <EditWorkerForm
            projectId={projectId}
            worker={{
              id: worker.id,
              name: worker.name,
              trade: worker.trade ?? "",
              dailyRate: worker.dailyRate ?? undefined,
              icNumber: worker.icNumber ?? "",
              cidbNumber: worker.cidbNumber ?? "",
              cidbExpiry: worker.cidbExpiry ? worker.cidbExpiry.toISOString().slice(0, 10) : "",
            }}
          />
        </div>
      </div>
    </>
  );
}
