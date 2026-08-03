import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import NewProjectForm from "./NewProjectForm";

/**
 * The form only exists for someone who can actually create a project.
 *
 * The button that leads here has always been gated; the page behind it never
 * was. So a Viewer who reached this URL — from the dashboard, which showed
 * them the button, or from a bookmark — was given the whole form and only
 * told no when they pressed Create. The API refused them either way; what
 * was missing was saying so before they filled it in.
 */
export default async function NewProjectPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "manageProjects")) redirect("/projects");

  return <NewProjectForm />;
}
