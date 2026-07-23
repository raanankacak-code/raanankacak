import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgSubscription } from "@/lib/db/subscriptions";

const getSubscriptionForOrgMock = vi.fn();
const countActiveProjectsForOrgMock = vi.fn();
const countActiveWorkersForOrgMock = vi.fn();
const countActiveMembersForOrgMock = vi.fn();
const countPendingInvitesForOrgMock = vi.fn();

vi.mock("@/lib/db/subscriptions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/subscriptions")>("@/lib/db/subscriptions");
  return { ...actual, getSubscriptionForOrg: getSubscriptionForOrgMock };
});

vi.mock("@/lib/db/projects", () => ({
  countActiveProjectsForOrg: countActiveProjectsForOrgMock,
}));

vi.mock("@/lib/db/workers", () => ({
  countActiveWorkersForOrg: countActiveWorkersForOrgMock,
}));

vi.mock("@/lib/db/team", () => ({
  countActiveMembersForOrg: countActiveMembersForOrgMock,
  countPendingInvitesForOrg: countPendingInvitesForOrgMock,
}));

const { assertCanCreateProject, assertCanAddWorker, assertCanAddTeamAccount, assertCostReportsIncluded } =
  await import("@/lib/billing/limits");

function subOnPlan(plan: OrgSubscription["plan"]): OrgSubscription {
  return {
    id: "sub-1",
    orgId: "org-1",
    plan,
    status: "ACTIVE",
    trialEndsAt: new Date(Date.now() + 86400000),
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  getSubscriptionForOrgMock.mockReset();
  countActiveProjectsForOrgMock.mockReset();
  countActiveWorkersForOrgMock.mockReset();
  countActiveMembersForOrgMock.mockReset();
  countPendingInvitesForOrgMock.mockReset();
});

describe("assertCanCreateProject", () => {
  it("throws 402 when a Starter org already has 3 active projects", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("STARTER"));
    countActiveProjectsForOrgMock.mockResolvedValue(3);

    await expect(assertCanCreateProject("org-1")).rejects.toMatchObject({ status: 402 });
  });

  it("allows a Starter org below the limit", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("STARTER"));
    countActiveProjectsForOrgMock.mockResolvedValue(2);

    await expect(assertCanCreateProject("org-1")).resolves.toBeUndefined();
  });

  it("never counts projects for an unlimited plan", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("PROFESSIONAL"));

    await expect(assertCanCreateProject("org-1")).resolves.toBeUndefined();
    expect(countActiveProjectsForOrgMock).not.toHaveBeenCalled();
  });
});

describe("assertCanAddWorker", () => {
  it("throws 402 when a Professional org already has 100 active workers", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("PROFESSIONAL"));
    countActiveWorkersForOrgMock.mockResolvedValue(100);

    await expect(assertCanAddWorker("org-1")).rejects.toMatchObject({ status: 402 });
  });

  it("is unlimited on Business", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("BUSINESS"));

    await expect(assertCanAddWorker("org-1")).resolves.toBeUndefined();
    expect(countActiveWorkersForOrgMock).not.toHaveBeenCalled();
  });
});

describe("assertCanAddTeamAccount", () => {
  it("counts pending invitations against the seat limit, not just active members", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("STARTER")); // 5 seats
    countActiveMembersForOrgMock.mockResolvedValue(3);
    countPendingInvitesForOrgMock.mockResolvedValue(2);

    await expect(assertCanAddTeamAccount("org-1")).rejects.toMatchObject({ status: 402 });
  });

  it("allows when members + pending invites are below the limit", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("STARTER"));
    countActiveMembersForOrgMock.mockResolvedValue(3);
    countPendingInvitesForOrgMock.mockResolvedValue(1);

    await expect(assertCanAddTeamAccount("org-1")).resolves.toBeUndefined();
  });
});

describe("assertCostReportsIncluded", () => {
  it("throws 402 on Starter", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("STARTER"));
    await expect(assertCostReportsIncluded("org-1")).rejects.toMatchObject({ status: 402 });
  });

  it("passes on Professional", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subOnPlan("PROFESSIONAL"));
    await expect(assertCostReportsIncluded("org-1")).resolves.toBeUndefined();
  });
});
