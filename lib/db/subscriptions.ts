import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  PLANS,
  TRIAL_DAYS,
  TRIAL_PLAN,
  type Plan,
  type PlanId,
} from "@/lib/billing/plans";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED";

export interface OrgSubscription {
  id: string;
  orgId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapSubscription(row: Record<string, unknown>): OrgSubscription {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    plan: row.plan as PlanId,
    status: row.status as SubscriptionStatus,
    trialEndsAt: new Date(row.trial_ends_at as string),
    currentPeriodEnd: row.current_period_end
      ? new Date(row.current_period_end as string)
      : null,
    stripeCustomerId: row.stripe_customer_id as string | null,
    stripeSubscriptionId: row.stripe_subscription_id as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Returns the org's subscription, creating a fresh trial on first access.
 * Lazy creation doubles as the backfill for orgs that predate billing.
 */
export async function getSubscriptionForOrg(
  orgId: string,
): Promise<OrgSubscription> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("org_subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data) return mapSubscription(data);

  const trialEndsAt = new Date(
    Date.now() + TRIAL_DAYS * 86400000,
  ).toISOString();
  const { data: created, error: insertError } = await supabase
    .from("org_subscriptions")
    .insert({
      org_id: orgId,
      plan: TRIAL_PLAN,
      status: "TRIALING",
      trial_ends_at: trialEndsAt,
    })
    .select("*")
    .single();
  if (insertError) {
    // A concurrent request may have created the row first (org_id is unique) —
    // re-read instead of failing.
    const { data: existing, error: rereadError } = await supabase
      .from("org_subscriptions")
      .select("*")
      .eq("org_id", orgId)
      .single();
    if (rereadError) throw insertError;
    return mapSubscription(existing);
  }
  return mapSubscription(created);
}

/**
 * Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in
 * projects.ts) — reads through the session-bound client instead of the
 * admin client. The lazy-create-on-first-access path stays on the admin
 * client (there is no INSERT RLS policy for a session-scoped key, by
 * design — see supabase/schema.sql), so this falls back to
 * getSubscriptionForOrg only for that one-time, first-ever-access case.
 */
export async function getSubscriptionForOrgViaSession(
  orgId: string,
): Promise<OrgSubscription> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("org_subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data) return mapSubscription(data);
  return getSubscriptionForOrg(orgId);
}

/**
 * The subscription states that allow writing business data. PAST_DUE stays
 * writable — payment problems get a dunning window (handled in Phase B),
 * not an instant lockout.
 */
export function isSubscriptionWritable(
  sub: OrgSubscription,
  now: number = Date.now(),
): boolean {
  switch (sub.status) {
    case "TRIALING":
      return sub.trialEndsAt.getTime() > now;
    case "ACTIVE":
    case "PAST_DUE":
      return true;
    case "CANCELLED":
      return false;
  }
}

/** Whole trial days remaining, never negative. */
export function trialDaysLeft(
  sub: OrgSubscription,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now) / 86400000));
}

export function planFor(sub: OrgSubscription): Plan {
  return PLANS[sub.plan];
}

/** Persists the Stripe customer id the first time an org starts checkout. */
export async function setStripeCustomerId(
  orgId: string,
  stripeCustomerId: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("org_subscriptions")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("org_id", orgId);
  if (error) throw error;
}

export async function getSubscriptionByStripeCustomerId(
  stripeCustomerId: string,
): Promise<OrgSubscription | null> {
  const { data, error } = await createAdminClient()
    .from("org_subscriptions")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSubscription(data) : null;
}

/**
 * Applies the authoritative state from a Stripe subscription object
 * (called only from the webhook handler, which has already verified the
 * event's signature). org_id is resolved via stripe_customer_id, which is
 * set during checkout before Stripe can send any subscription event.
 */
export async function syncSubscriptionFromStripe(
  stripeCustomerId: string,
  input: {
    stripeSubscriptionId: string;
    plan: PlanId;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
  },
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("org_subscriptions")
    .update({
      stripe_subscription_id: input.stripeSubscriptionId,
      plan: input.plan,
      status: input.status,
      current_period_end: input.currentPeriodEnd
        ? input.currentPeriodEnd.toISOString()
        : null,
    })
    .eq("stripe_customer_id", stripeCustomerId)
    .select("org_id");
  if (error) throw error;
  // Null means the customer id matched no org. That is not an error — Stripe
  // will happily send events for customers this deployment has never heard of
  // — but the caller needs to know, both to audit against the right org and
  // to avoid claiming it applied something it didn't.
  return (data?.[0]?.org_id as string | undefined) ?? null;
}
