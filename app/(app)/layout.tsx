import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { countRequestsByStatusForOrg } from "@/lib/db/materials";
import { countOpenFindingsForOrg } from "@/lib/db/safety";
import { getSubscriptionForOrgViaSession, isSubscriptionWritable, trialDaysLeft } from "@/lib/db/subscriptions";
import { can, isClient } from "@/lib/permissions";
import { countOverdueDefectsForOrg } from "@/lib/db/defects";
import { countEquipmentNeedingAttention } from "@/lib/db/equipment";
import { todayInOrgTimezone } from "@/lib/today";
import AppShell from "@/components/app/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMember();
  if (!member) redirect("/signup/company");
  // A client has no business in the staff app, and every route handler under
  // it refuses them anyway — landing here would be a page of empty cards and
  // failed fetches rather than an answer.
  if (isClient(member.role)) redirect("/portal");

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
  // Overdue, not merely outstanding. A badge showing every open snag on a
  // busy site is a number nobody looks at twice; a badge showing what has
  // missed its date is a number worth acting on.
  const defectsBadge = can(member.role, "viewReports")
    ? await countOverdueDefectsForOrg(member.orgId, todayInOrgTimezone())
    : 0;
  // Expired inspections and overdue services together — both mean a machine
  // that should not simply carry on working.
  const equipmentAttention = can(member.role, "viewReports")
    ? await countEquipmentNeedingAttention(member.orgId, todayInOrgTimezone())
    : { inspectionExpired: 0, serviceOverdue: 0 };
  const equipmentBadge = equipmentAttention.inspectionExpired + equipmentAttention.serviceOverdue;

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
      defectsBadge={defectsBadge}
      equipmentBadge={equipmentBadge}
      billing={billing}
    >
      {children}
    </AppShell>
  );
}
