import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import ProfileView from "./ProfileView";

export default async function ProfilePage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  const org = await getOrganizationById(member.orgId);

  return (
    <ProfileView
      name={member.name}
      email={member.email}
      role={member.role}
      orgName={org?.name ?? "your company"}
    />
  );
}
