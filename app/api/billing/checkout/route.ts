import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { getSubscriptionForOrg, setStripeCustomerId } from "@/lib/db/subscriptions";
import { getStripeClient, priceIdForPlan } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/billing/plans";

const checkoutSchema = z.object({
  plan: z.enum(["STARTER", "PROFESSIONAL", "BUSINESS"]),
});

/** Starts a Stripe Checkout session for the caller's org to subscribe to a plan. */
export async function POST(request: Request) {
  try {
    const member = await requireMember("manageOrg");
    const body = checkoutSchema.parse(await request.json());

    const priceId = priceIdForPlan(body.plan);
    if (!priceId) {
      throw new ApiError(500, `${PLANS[body.plan].name} isn't available for online checkout yet — contact support.`);
    }

    const stripe = getStripeClient();
    const sub = await getSubscriptionForOrg(member.orgId);
    const org = await getOrganizationById(member.orgId);

    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: member.email,
        name: org?.name,
        metadata: { orgId: member.orgId },
      });
      customerId = customer.id;
      await setStripeCustomerId(member.orgId, customerId);
    }

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      client_reference_id: member.orgId,
      subscription_data: { metadata: { orgId: member.orgId } },
    });

    if (!session.url) throw new ApiError(500, "Could not start checkout. Try again.");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
