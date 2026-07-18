import { getCurrentMember } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationById } from "@/lib/db/organizations";
import HelpView from "./HelpView";

export default async function HelpPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  const org = await getOrganizationById(member.orgId);

  return <HelpView orgName={org?.shortName || org?.name || "your team"} memberFirstName={member.name.split(" ")[0]} />;
}
