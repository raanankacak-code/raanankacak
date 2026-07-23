import { describe, expect, it } from "vitest";
import { isSubscriptionWritable, trialDaysLeft, type OrgSubscription } from "@/lib/db/subscriptions";

const NOW = new Date("2026-07-23T12:00:00.000Z").getTime();

function sub(overrides: Partial<OrgSubscription> = {}): OrgSubscription {
  return {
    id: "sub-1",
    orgId: "org-1",
    plan: "PROFESSIONAL",
    status: "TRIALING",
    trialEndsAt: new Date(NOW + 7 * 86400000),
    currentPeriodEnd: null,
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
