import Stripe from "stripe";
import type { PlanId } from "@/lib/billing/plans";

let client: Stripe | null = null;

/** Lazily constructed — importing this module must not throw when the key isn't set yet (e.g. at build time). */
export function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

const PRICE_ENV_BY_PLAN: Record<PlanId, string> = {
  STARTER: "STRIPE_PRICE_STARTER",
  PROFESSIONAL: "STRIPE_PRICE_PROFESSIONAL",
  BUSINESS: "STRIPE_PRICE_BUSINESS",
};

/** The Stripe Price id configured for a plan, or null if that plan isn't set up for checkout yet. */
export function priceIdForPlan(plan: PlanId): string | null {
  return process.env[PRICE_ENV_BY_PLAN[plan]] || null;
}

/** Reverse lookup used when syncing a Stripe subscription back to a plan id. */
export function planForPriceId(priceId: string): PlanId | null {
  for (const plan of Object.keys(PRICE_ENV_BY_PLAN) as PlanId[]) {
    if (priceIdForPlan(plan) === priceId) return plan;
  }
  return null;
}
