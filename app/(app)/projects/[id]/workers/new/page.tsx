import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProjectById } from "@/lib/db/projects";
import NewWorkerForm from "./NewWorkerForm";

/** Adding someone to the roster needs the permission to manage the roster. */
export default async function NewWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { id } = await params;
  // Checked before the permission, so a project in another workspace is a 404
  // rather than a redirect that would confirm it exists.
  const project = await getProjectById(member.orgId, id);
  if (!project) notFound();
  if (!can(member.role, "manageWorkers")) redirect(`/projects/${id}?tab=workers`);

  return <NewWorkerForm projectId={id} />;
}
