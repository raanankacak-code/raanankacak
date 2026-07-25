import { NextResponse } from "next/server";
import { requireMember, apiErrorResponse } from "@/lib/auth";
import { getSubscriptionForOrgViaSession, isSubscriptionWritable, planFor, trialDaysLeft } from "@/lib/db/subscriptions";
import { PLANS } from "@/lib/billing/plans";
import { countActiveProjectsForOrg } from "@/lib/db/projects";
import { countActiveWorkersForOrg } from "@/lib/db/workers";
import { countActiveMembersForOrg, countPendingInvitesForOrg } from "@/lib/db/team";

export async function GET() {
  try {
    const member = await requireMember("manageOrg");
    const sub = await getSubscriptionForOrgViaSession(member.orgId);
    const [projects, workers, members, pendingInvites] = await Promise.all([
      countActiveProjectsForOrg(member.orgId),
      countActiveWorkersForOrg(member.orgId),
      countActiveMembersForOrg(member.orgId),
      countPendingInvitesForOrg(member.orgId),
    ]);

    return NextResponse.json({
      subscription: {
        plan: sub.plan,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        trialDaysLeft: trialDaysLeft(sub),
        writable: isSubscriptionWritable(sub),
      },
      planDetails: planFor(sub),
      usage: {
        activeProjects: projects,
        workers,
        teamAccounts: members + pendingInvites,
      },
      plans: PLANS,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
