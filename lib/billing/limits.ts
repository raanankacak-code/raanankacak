import { ApiError } from "@/lib/auth";
import { getSubscriptionForOrgViaSession, planFor } from "@/lib/db/subscriptions";
import { withinLimit } from "@/lib/billing/plans";
import { countActiveProjectsForOrg } from "@/lib/db/projects";
import { countActiveWorkersForOrg } from "@/lib/db/workers";
import { countActiveMembersForOrg, countPendingInvitesForOrg } from "@/lib/db/team";
import { sumStorageBytesForOrg } from "@/lib/uploads";

/**
 * Plan-limit guards for creation endpoints. Each throws a 402 with an
 * upgrade-oriented message when the org's plan is at capacity. Enforcement
 * lives server-side only — client UI may hint, but must never be trusted.
 */

export async function assertCanCreateProject(orgId: string): Promise<void> {
  const plan = planFor(await getSubscriptionForOrgViaSession(orgId));
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
  const plan = planFor(await getSubscriptionForOrgViaSession(orgId));
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
  const plan = planFor(await getSubscriptionForOrgViaSession(orgId));
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

/**
 * Storage is the one limit measured in a continuous unit, so it's checked
 * against the size of the file being uploaded rather than a row count —
 * an upload that would cross the cap is refused, not truncated.
 */
export async function assertCanStoreFile(orgId: string, incomingBytes: number): Promise<void> {
  const plan = planFor(await getSubscriptionForOrgViaSession(orgId));
  if (plan.maxStorageBytes === null) return;
  const used = await sumStorageBytesForOrg(orgId);
  if (used + incomingBytes > plan.maxStorageBytes) {
    throw new ApiError(
      402,
      `The ${plan.name} plan includes ${formatGb(plan.maxStorageBytes)} of file storage, and this upload would exceed it (${formatGb(used)} used). Delete some files, or upgrade on the Billing page.`,
    );
  }
}

function formatGb(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Math.round(gb * 10) / 10}GB` : `${Math.round(bytes / (1024 * 1024))}MB`;
}

export async function assertCostReportsIncluded(orgId: string): Promise<void> {
  const plan = planFor(await getSubscriptionForOrgViaSession(orgId));
  if (!plan.costReports) {
    throw new ApiError(402, `Cost reports are included from the Professional plan up. Upgrade on the Billing page to use them.`);
  }
}
