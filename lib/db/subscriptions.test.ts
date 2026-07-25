import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgSubscription } from "@/lib/db/subscriptions";

const createAdminClientMock = vi.fn();
const createSessionClientMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

const { getSubscriptionForOrgViaSession, isSubscriptionWritable, trialDaysLeft } = await import(
  "@/lib/db/subscriptions"
);

const NOW = new Date("2026-07-23T12:00:00.000Z").getTime();

function sub(overrides: Partial<OrgSubscription> = {}): OrgSubscription {
  return {
    id: "sub-1",
    orgId: "org-1",
    plan: "PROFESSIONAL",
    status: "TRIALING",
    trialEndsAt: new Date(NOW + 7 * 86400000),
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: new Date(NOW - 7 * 86400000),
    updatedAt: new Date(NOW - 7 * 86400000),
    ...overrides,
  };
}

describe("isSubscriptionWritable", () => {
  it("is writable while the trial is still running", () => {
    expect(isSubscriptionWritable(sub(), NOW)).toBe(true);
  });

  it("becomes read-only the moment the trial has ended", () => {
    expect(isSubscriptionWritable(sub({ trialEndsAt: new Date(NOW - 1) }), NOW)).toBe(false);
  });

  it("is writable when ACTIVE", () => {
    expect(isSubscriptionWritable(sub({ status: "ACTIVE" }), NOW)).toBe(true);
  });

  it("stays writable when PAST_DUE (dunning is handled by billing, not a lockout)", () => {
    expect(isSubscriptionWritable(sub({ status: "PAST_DUE" }), NOW)).toBe(true);
  });

  it("is read-only when CANCELLED", () => {
    expect(isSubscriptionWritable(sub({ status: "CANCELLED" }), NOW)).toBe(false);
  });
});

describe("trialDaysLeft", () => {
  it("counts whole days remaining, rounding up", () => {
    expect(trialDaysLeft(sub({ trialEndsAt: new Date(NOW + 7 * 86400000) }), NOW)).toBe(7);
    expect(trialDaysLeft(sub({ trialEndsAt: new Date(NOW + 0.5 * 86400000) }), NOW)).toBe(1);
  });

  it("never goes negative after expiry", () => {
    expect(trialDaysLeft(sub({ trialEndsAt: new Date(NOW - 3 * 86400000) }), NOW)).toBe(0);
  });
});

function subscriptionRow() {
  return {
    id: "sub-1",
    org_id: "org-A",
    plan: "PROFESSIONAL",
    status: "TRIALING",
    trial_ends_at: new Date(NOW + 7 * 86400000).toISOString(),
    current_period_end: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
  };
}

describe("getSubscriptionForOrgViaSession", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
    createSessionClientMock.mockReset();
    eqMock.mockReset();
    maybeSingleMock.mockReset();
    selectMock.mockReset();
    fromMock.mockReset();

    maybeSingleMock.mockResolvedValue({ data: subscriptionRow(), error: null });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });
    createSessionClientMock.mockResolvedValue({ from: fromMock });
  });

  it("reads through the session-bound (RLS-subject) client, not the admin client", async () => {
    await getSubscriptionForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("org_subscriptions");
  });

  it("still applies the org_id filter as defense in depth alongside RLS", async () => {
    await getSubscriptionForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("maps the row into an OrgSubscription", async () => {
    const result = await getSubscriptionForOrgViaSession("org-A");

    expect(result).toMatchObject({ id: "sub-1", orgId: "org-A", plan: "PROFESSIONAL", status: "TRIALING" });
  });

  it("propagates a query error instead of swallowing it", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: new Error("query failed") });

    await expect(getSubscriptionForOrgViaSession("org-A")).rejects.toThrow("query failed");
  });

  it("falls back to the admin client to lazily create the trial on first-ever access", async () => {
    // No row visible to the session client yet — the org predates billing, or
    // this is its very first request. Creating the row needs the admin client:
    // there is no INSERT policy for a session-scoped key, by design.
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const adminMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const adminSingle = vi.fn().mockResolvedValue({ data: subscriptionRow(), error: null });
    const adminBuilder: Record<string, unknown> = {};
    adminBuilder.select = vi.fn(() => adminBuilder);
    adminBuilder.eq = vi.fn(() => adminBuilder);
    adminBuilder.insert = vi.fn(() => adminBuilder);
    adminBuilder.maybeSingle = adminMaybeSingle;
    adminBuilder.single = adminSingle;
    createAdminClientMock.mockReturnValue({ from: vi.fn(() => adminBuilder) });

    const result = await getSubscriptionForOrgViaSession("org-A");

    expect(createAdminClientMock).toHaveBeenCalled();
    expect(adminBuilder.insert).toHaveBeenCalled();
    expect(result).toMatchObject({ orgId: "org-A" });
  });
});
