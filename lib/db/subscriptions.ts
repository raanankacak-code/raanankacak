import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN, type Plan, type PlanId } from "@/lib/billing/plans";

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

export interface OrgSubscription {
  id: string;
  orgId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
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
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Returns the org's subscription, creating a fresh trial on first access.
 * Lazy creation doubles as the backfill for orgs that predate billing.
 */
export async function getSubscriptionForOrg(orgId: string): Promise<OrgSubscription> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("org_subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data) return mapSubscription(data);

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
  const { data: created, error: insertError } = await supabase
    .from("org_subscriptions")
    .insert({ org_id: orgId, plan: TRIAL_PLAN, status: "TRIALING", trial_ends_at: trialEndsAt })
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
 * The subscription states that allow writing business data. PAST_DUE stays
 * writable — payment problems get a dunning window (handled in Phase B),
 * not an instant lockout.
 */
export function isSubscriptionWritable(sub: OrgSubscription, now: number = Date.now()): boolean {
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
export function trialDaysLeft(sub: OrgSubscription, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now) / 86400000));
}

export function planFor(sub: OrgSubscription): Plan {
  return PLANS[sub.plan];
}
