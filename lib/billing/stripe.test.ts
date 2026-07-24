import { afterEach, describe, expect, it, vi } from "vitest";
import { getStripeClient, priceIdForPlan, planForPriceId } from "@/lib/billing/stripe";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStripeClient", () => {
  it("throws a clear error when STRIPE_SECRET_KEY is not configured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(() => getStripeClient()).toThrow("STRIPE_SECRET_KEY is not set");
  });
});

describe("priceIdForPlan / planForPriceId", () => {
  it("resolves the price id configured for each plan via its env var", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_123");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_123");
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_biz_123");

    expect(priceIdForPlan("STARTER")).toBe("price_starter_123");
    expect(priceIdForPlan("PROFESSIONAL")).toBe("price_pro_123");
    expect(priceIdForPlan("BUSINESS")).toBe("price_biz_123");
  });

  it("returns null for a plan with no configured price", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "");
    expect(priceIdForPlan("STARTER")).toBeNull();
  });

  it("reverse-resolves a price id back to its plan", () => {
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_456");
    expect(planForPriceId("price_pro_456")).toBe("PROFESSIONAL");
  });

  it("returns null for an unrecognized price id", () => {
    expect(planForPriceId("price_unknown")).toBeNull();
  });
});
