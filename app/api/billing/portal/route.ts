import { NextResponse } from "next/server";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { getSubscriptionForOrg } from "@/lib/db/subscriptions";
import { getStripeClient } from "@/lib/billing/stripe";

/** Opens the Stripe Billing Portal so the org can update payment method, view invoices, or cancel. */
export async function POST(request: Request) {
  try {
    const member = await requireMember("manageOrg");
    const sub = await getSubscriptionForOrg(member.orgId);
    if (!sub.stripeCustomerId) {
      throw new ApiError(400, "No billing account yet — choose a plan first.");
    }

    const stripe = getStripeClient();
    const origin = new URL(request.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${origin}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
