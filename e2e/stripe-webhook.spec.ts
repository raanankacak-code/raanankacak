import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, adminClient, type SeedInfo } from "./seed";

/**
 * The Stripe webhook: the only thing that moves a subscription between
 * states after checkout. Everything downstream of it — whether a workspace
 * is writable, which plan's limits apply — follows from what this route
 * writes, and until now it was only unit-tested.
 *
 * No Stripe account or network call is involved. Signature verification is
 * HMAC-SHA256 over `{timestamp}.{payload}` with the endpoint secret, which
 * this spec can produce itself, so the real verification, event routing,
 * price->plan mapping and database sync all get exercised. The test-only
 * secrets are set on the web server in playwright.config.ts.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));
const WEBHOOK_SECRET = "whsec_e2e_test_secret";

function sign(payload: string, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function subscriptionEvent(overrides: {
  type: string;
  status: string;
  priceId?: string;
  customerId?: string;
  currentPeriodEnd?: number;
}) {
  return JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: overrides.type,
    data: {
      object: {
        id: `sub_e2e_${Date.now()}`,
        object: "subscription",
        customer: overrides.customerId ?? seed.orgD.stripeCustomerId,
        status: overrides.status,
        items: {
          object: "list",
          data: [
            {
              id: "si_e2e",
              object: "subscription_item",
              price: { id: overrides.priceId ?? "price_e2e_professional", object: "price" },
              current_period_end: overrides.currentPeriodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400,
            },
          ],
        },
      },
    },
  });
}

async function subscriptionRow() {
  const { data } = await adminClient()
    .from("org_subscriptions")
    .select("plan, status, stripe_subscription_id")
    .eq("org_id", seed.orgD.id)
    .single();
  return data;
}

test.describe.configure({ mode: "serial" });

test.describe("stripe webhook", () => {
  test("refuses an unsigned request", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json" },
      data: subscriptionEvent({ type: "customer.subscription.updated", status: "active" }),
    });

    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("refuses a forged signature", async ({ playwright }) => {
    // Anyone can POST here; the signature is the only thing establishing
    // that Stripe sent it. Without this check, activating your own
    // subscription would be a single curl.
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const payload = subscriptionEvent({ type: "customer.subscription.updated", status: "active" });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload, "whsec_wrong_secret") },
      data: payload,
    });

    expect(res.status()).toBe(400);
    expect(await subscriptionRow()).toMatchObject({ plan: "STARTER", status: "TRIALING" });

    await ctx.dispose();
  });

  test("refuses a signature that does not match the body", async ({ playwright }) => {
    // Signing one payload and sending another is the obvious replay attempt.
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const signedFor = subscriptionEvent({ type: "customer.subscription.updated", status: "active" });
    const actuallySent = subscriptionEvent({ type: "customer.subscription.updated", status: "canceled" });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(signedFor) },
      data: actuallySent,
    });

    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("activates the subscription on a properly signed event", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const payload = subscriptionEvent({
      type: "customer.subscription.updated",
      status: "active",
      priceId: "price_e2e_professional",
    });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
      data: payload,
    });

    expect(res.ok()).toBeTruthy();
    // STARTER/TRIALING before; the price id is what selects the plan.
    expect(await subscriptionRow()).toMatchObject({ plan: "PROFESSIONAL", status: "ACTIVE" });

    await ctx.dispose();
  });

  test("a failed payment moves it to past due, not cancelled", async ({ playwright }) => {
    // PAST_DUE stays writable on purpose — a card problem gets a dunning
    // window rather than an instant lockout.
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const payload = subscriptionEvent({ type: "customer.subscription.updated", status: "past_due" });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
      data: payload,
    });

    expect(res.ok()).toBeTruthy();
    expect(await subscriptionRow()).toMatchObject({ status: "PAST_DUE" });

    await ctx.dispose();
  });

  test("ignores a transient status instead of writing a half-state", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const before = await subscriptionRow();
    const payload = subscriptionEvent({ type: "customer.subscription.updated", status: "incomplete" });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
      data: payload,
    });

    // Accepted, so Stripe stops retrying, but nothing changes — the
    // follow-up event once payment resolves is what counts.
    expect(res.ok()).toBeTruthy();
    expect(await subscriptionRow()).toMatchObject({ status: before!.status, plan: before!.plan });

    await ctx.dispose();
  });

  test("ignores an unrecognised price rather than guessing a plan", async ({ playwright }) => {
    // A price id we don't know about means the STRIPE_PRICE_* config is out
    // of step with Stripe. Downgrading someone because of that would be
    // worse than doing nothing and logging it.
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const before = await subscriptionRow();
    const payload = subscriptionEvent({
      type: "customer.subscription.updated",
      status: "active",
      priceId: "price_not_configured_anywhere",
    });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
      data: payload,
    });

    expect(res.ok()).toBeTruthy();
    expect(await subscriptionRow()).toMatchObject({ plan: before!.plan });

    await ctx.dispose();
  });

  test("an event for an unknown customer touches nobody else's subscription", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const before = await subscriptionRow();
    const payload = subscriptionEvent({
      type: "customer.subscription.updated",
      status: "canceled",
      customerId: "cus_belongs_to_nobody",
    });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
      data: payload,
    });

    expect(res.ok()).toBeTruthy();
    expect(await subscriptionRow()).toMatchObject({ status: before!.status });

    await ctx.dispose();
  });

  test("cancellation is recorded", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const payload = subscriptionEvent({ type: "customer.subscription.deleted", status: "canceled" });

    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
      data: payload,
    });

    expect(res.ok()).toBeTruthy();
    expect(await subscriptionRow()).toMatchObject({ status: "CANCELLED" });

    await ctx.dispose();
  });
});
