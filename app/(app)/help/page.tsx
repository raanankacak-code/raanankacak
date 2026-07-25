import { getCurrentMember } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationById } from "@/lib/db/organizations";
import { listMembersForOrgViaSession } from "@/lib/db/team";
import HelpView from "./HelpView";

export default async function HelpPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  const [org, members] = await Promise.all([getOrganizationById(member.orgId), listMembersForOrgViaSession(member.orgId)]);

  const admins = members
    .filter((m): m is typeof m & { role: "OWNER" | "ADMIN" } => m.active && (m.role === "OWNER" || m.role === "ADMIN"))
    .map((m) => ({ name: m.name, email: m.email, role: m.role }));

  return (
    <HelpView
      orgName={org?.shortName || org?.name || "your team"}
      memberFirstName={member.name.split(" ")[0]}
      orgEmail={org?.email ?? null}
      orgPhone={org?.phone ?? null}
      admins={admins}
    />
  );
}
