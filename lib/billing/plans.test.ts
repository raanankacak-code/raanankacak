import { describe, expect, it } from "vitest";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN, withinLimit } from "@/lib/billing/plans";

describe("PLANS", () => {
  it("matches the limits advertised on the public pricing page", () => {
    // These numbers are a public promise (components/auth/PricingSection.tsx).
    // If a plan changes, change the pricing page in the same commit.
    expect(PLANS.STARTER).toMatchObject({ priceMyr: 999, maxActiveProjects: 3, maxWorkers: 25, maxTeamAccounts: 5 });
    expect(PLANS.PROFESSIONAL).toMatchObject({ priceMyr: 1799, maxActiveProjects: null, maxWorkers: 100, maxTeamAccounts: 20 });
    expect(PLANS.BUSINESS).toMatchObject({ priceMyr: 1999, maxActiveProjects: null, maxWorkers: null, maxTeamAccounts: null });
  });

  it("gates cost reports to Professional and up, as advertised", () => {
    expect(PLANS.STARTER.costReports).toBe(false);
    expect(PLANS.PROFESSIONAL.costReports).toBe(true);
    expect(PLANS.BUSINESS.costReports).toBe(true);
  });

  it("prices strictly increase with plan tier", () => {
    expect(PLANS.STARTER.priceMyr).toBeLessThan(PLANS.PROFESSIONAL.priceMyr);
    expect(PLANS.PROFESSIONAL.priceMyr).toBeLessThan(PLANS.BUSINESS.priceMyr);
  });

  it("trials run 14 days on the Professional plan", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_PLAN).toBe("PROFESSIONAL");
  });
});

describe("withinLimit", () => {
  it("treats null as unlimited", () => {
    expect(withinLimit(null, 1_000_000)).toBe(true);
  });

  it("allows below the limit and blocks at the limit", () => {
    expect(withinLimit(3, 2)).toBe(true);
    expect(withinLimit(3, 3)).toBe(false);
    expect(withinLimit(3, 4)).toBe(false);
  });
});
