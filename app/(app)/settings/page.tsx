import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import SettingsView from "./SettingsView";

export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) redirect("/dashboard");

  const org = await getOrganizationById(member.orgId);
  if (!org) redirect("/dashboard");

  return <SettingsView org={org} role={member.role} />;
}
