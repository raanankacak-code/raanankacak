import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { countRequestsByStatusForOrg } from "@/lib/db/materials";
import { countOpenFindingsForOrg } from "@/lib/db/safety";
import { getSubscriptionForOrgViaSession, isSubscriptionWritable, trialDaysLeft } from "@/lib/db/subscriptions";
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
    // Counted in the database rather than by fetching every request and
    // filtering: an unbounded select is capped at 1000 rows without warning,
    // so this badge silently under-counted for any busy workspace.
    const counts = await countRequestsByStatusForOrg(member.orgId);
    materialsBadge = counts.SUBMITTED;
  }

  // Open inspections that actually found something. Counted in the database
  // for the same reason the materials badge is: an unbounded select is capped
  // at 1000 rows without warning.
  const safetyBadge = can(member.role, "viewReports") ? await countOpenFindingsForOrg(member.orgId) : 0;

  const subscription = await getSubscriptionForOrgViaSession(member.orgId);
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
      safetyBadge={safetyBadge}
      billing={billing}
    >
      {children}
    </AppShell>
  );
}
