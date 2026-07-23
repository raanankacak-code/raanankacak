import { ApiError } from "@/lib/auth";
import { getSubscriptionForOrg, planFor } from "@/lib/db/subscriptions";
import { withinLimit } from "@/lib/billing/plans";
import { countActiveProjectsForOrg } from "@/lib/db/projects";
import { countActiveWorkersForOrg } from "@/lib/db/workers";
import { countActiveMembersForOrg, countPendingInvitesForOrg } from "@/lib/db/team";

/**
 * Plan-limit guards for creation endpoints. Each throws a 402 with an
 * upgrade-oriented message when the org's plan is at capacity. Enforcement
 * lives server-side only — client UI may hint, but must never be trusted.
 */

export async function assertCanCreateProject(orgId: string): Promise<void> {
  const plan = planFor(await getSubscriptionForOrg(orgId));
  if (plan.maxActiveProjects === null) return;
  const current = await countActiveProjectsForOrg(orgId);
  if (!withinLimit(plan.maxActiveProjects, current)) {
    throw new ApiError(
      402,
      `The ${plan.name} plan includes ${plan.maxActiveProjects} active projects. Mark a project as Completed, or upgrade on the Billing page.`,
    );
  }
}

export async function assertCanAddWorker(orgId: string): Promise<void> {
  const plan = planFor(await getSubscriptionForOrg(orgId));
  if (plan.maxWorkers === null) return;
  const current = await countActiveWorkersForOrg(orgId);
  if (!withinLimit(plan.maxWorkers, current)) {
    throw new ApiError(
      402,
      `The ${plan.name} plan includes ${plan.maxWorkers} workers on the roster. Deactivate a worker, or upgrade on the Billing page.`,
    );
  }
}

export async function assertCanAddTeamAccount(orgId: string): Promise<void> {
  const plan = planFor(await getSubscriptionForOrg(orgId));
  if (plan.maxTeamAccounts === null) return;
  const [members, pendingInvites] = await Promise.all([
    countActiveMembersForOrg(orgId),
    countPendingInvitesForOrg(orgId),
  ]);
  if (!withinLimit(plan.maxTeamAccounts, members + pendingInvites)) {
    throw new ApiError(
      402,
      `The ${plan.name} plan includes ${plan.maxTeamAccounts} team accounts (including pending invitations). Remove one, or upgrade on the Billing page.`,
    );
  }
}

export async function assertCostReportsIncluded(orgId: string): Promise<void> {
  const plan = planFor(await getSubscriptionForOrg(orgId));
  if (!plan.costReports) {
    throw new ApiError(402, `Cost reports are included from the Professional plan up. Upgrade on the Billing page to use them.`);
  }
}
