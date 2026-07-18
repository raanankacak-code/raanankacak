import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getOrganizationById } from "@/lib/db/organizations";
import TeamView from "./TeamView";

export default async function TeamPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "manageUsers")) redirect("/dashboard");
  const org = await getOrganizationById(member.orgId);

  return <TeamView orgName={org?.name ?? "your company"} myRole={member.role} myId={member.id} />;
}
