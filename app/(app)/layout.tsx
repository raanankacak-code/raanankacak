import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { listRequestsForOrg } from "@/lib/db/materials";
import { getSubscriptionForOrg, isSubscriptionWritable, trialDaysLeft } from "@/lib/db/subscriptions";
import { can } from "@/lib/permissions";
import AppShell from "@/components/app/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMember();
  if (!member) redirect("/signup/company");

  const org = await getOrganizationById(member.orgId);
  if (!org) redirect("/signup/company");

  let materialsBadge = 0;
  if (can(member.role, "approveRequests")) {
    const requests = await listRequestsForOrg(member.orgId);
    materialsBadge = requests.filter((r) => r.status === "SUBMITTED").length;
  }

  const subscription = await getSubscriptionForOrg(member.orgId);
  const billing = {
    trialing: subscription.status === "TRIALING",
    daysLeft: trialDaysLeft(subscription),
    readOnly: !isSubscriptionWritable(subscription),
  };

  return (
    <AppShell
      memberName={member.name}
      role={member.role}
      orgName={org.name}
      orgShortName={org.shortName}
      orgLogoUrl={org.logoUrl}
      materialsBadge={materialsBadge}
      billing={billing}
    >
      {children}
    </AppShell>
  );
}
