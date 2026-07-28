import { NextResponse } from "next/server";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { getSubscriptionForOrgViaSession } from "@/lib/db/subscriptions";
import { getStripeClient } from "@/lib/billing/stripe";
import { appOrigin } from "@/lib/appOrigin";

/** Opens the Stripe Billing Portal so the org can update payment method, view invoices, or cancel. */
export async function POST(request: Request) {
  try {
    const member = await requireMember("manageOrg");
    const sub = await getSubscriptionForOrgViaSession(member.orgId);
    if (!sub.stripeCustomerId) {
      throw new ApiError(400, "No billing account yet — choose a plan first.");
    }

    const stripe = getStripeClient();
    const origin = appOrigin(request);
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${origin}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
