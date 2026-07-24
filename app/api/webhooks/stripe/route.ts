import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient, planForPriceId } from "@/lib/billing/stripe";
import { syncSubscriptionFromStripe, type SubscriptionStatus } from "@/lib/db/subscriptions";
import { logger, errorFields } from "@/lib/logger";

/**
 * Maps a Stripe subscription status to our internal one. Returns null for
 * transient states (payment still confirming) where we deliberately don't
 * touch our own record — the follow-up event once it resolves will.
 * "trialing" is treated as ACTIVE: BinaWorks runs its own pre-payment trial
 * (org_subscriptions.trial_ends_at), so a Stripe-side trial status is only
 * possible if a price is configured with one, which we don't currently do.
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return null;
  }
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const status = mapStripeStatus(subscription.status);
  if (!status) {
    logger.info("Stripe subscription event ignored (transient status)", { customerId, status: subscription.status });
    return;
  }

  const item = subscription.items.data[0];
  const plan = item ? planForPriceId(item.price.id) : null;
  if (!plan) {
    logger.error("Stripe subscription references an unrecognized price id — check STRIPE_PRICE_* env vars", {
      customerId,
      priceId: item?.price.id,
    });
    return;
  }

  await syncSubscriptionFromStripe(customerId, {
    stripeSubscriptionId: subscription.id,
    plan,
    status,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripeClient().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", errorFields(err));
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event.data.object);
        break;
      default:
        // Unhandled event types (invoices, payment methods, etc.) are expected
        // and fine to ignore — Stripe sends far more events than we act on.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("Stripe webhook handler failed", { eventType: event.type, ...errorFields(err) });
    // 500 so Stripe retries with its own backoff instead of silently dropping the event.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
