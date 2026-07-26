import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructEventAsyncMock = vi.fn();
const planForPriceIdMock = vi.fn();
const syncSubscriptionFromStripeMock = vi.fn();
const recordAuditEventMock = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({ webhooks: { constructEventAsync: constructEventAsyncMock } }),
  planForPriceId: planForPriceIdMock,
}));

vi.mock("@/lib/db/subscriptions", () => ({
  syncSubscriptionFromStripe: syncSubscriptionFromStripeMock,
}));

vi.mock("@/lib/db/auditLog", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");

function webhookRequest(body = "{}", signature: string | null = "t=1,v1=abc") {
  const headers: Record<string, string> = {};
  if (signature) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers });
}

function subscriptionEvent(
  type: string,
  overrides: { status?: string; priceId?: string; customerId?: string; currentPeriodEnd?: number } = {},
) {
  return {
    type,
    data: {
      object: {
        id: "sub_123",
        status: overrides.status ?? "active",
        customer: overrides.customerId ?? "cus_123",
        items: {
          data: [
            {
              price: { id: overrides.priceId ?? "price_pro" },
              current_period_end: overrides.currentPeriodEnd ?? 1_800_000_000,
            },
          ],
        },
      },
    },
  };
}

beforeEach(() => {
  constructEventAsyncMock.mockReset();
  planForPriceIdMock.mockReset();
  syncSubscriptionFromStripeMock.mockReset();
  recordAuditEventMock.mockReset();
  // The sync now reports which org it matched, so the webhook can attribute
  // the audit entry. Default to a match; the no-match case is tested below.
  syncSubscriptionFromStripeMock.mockResolvedValue("org-A");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/stripe audit logging", () => {
  it("records the change against the matched org, attributed to Stripe rather than a member", async () => {
    constructEventAsyncMock.mockResolvedValue(
      subscriptionEvent("customer.subscription.updated", { status: "active", priceId: "price_pro" }),
    );
    planForPriceIdMock.mockReturnValue("PROFESSIONAL");

    await POST(webhookRequest());

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({
        action: "SUBSCRIPTION_CHANGED",
        // Nobody in the workspace did this, and pretending otherwise would
        // put a member's name against a change they never made.
        actorMemberId: null,
        actorName: "Stripe",
        metadata: expect.objectContaining({ plan: "PROFESSIONAL", status: "ACTIVE" }),
      }),
    );
  });

  it("records nothing when the customer matches no organization", async () => {
    constructEventAsyncMock.mockResolvedValue(
      subscriptionEvent("customer.subscription.updated", { customerId: "cus_stranger" }),
    );
    planForPriceIdMock.mockReturnValue("PROFESSIONAL");
    syncSubscriptionFromStripeMock.mockResolvedValue(null);

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("records nothing when the price id maps to no plan", async () => {
    constructEventAsyncMock.mockResolvedValue(subscriptionEvent("customer.subscription.updated"));
    planForPriceIdMock.mockReturnValue(null);

    await POST(webhookRequest());

    expect(syncSubscriptionFromStripeMock).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await POST(webhookRequest("{}", null));
    expect(res.status).toBe(400);
    expect(constructEventAsyncMock).not.toHaveBeenCalled();
  });

  it("returns 400 when STRIPE_WEBHOOK_SECRET isn't configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await POST(webhookRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 and never processes the event when signature verification fails", async () => {
    constructEventAsyncMock.mockRejectedValue(new Error("signature mismatch"));
    const res = await POST(webhookRequest());
    expect(res.status).toBe(400);
    expect(syncSubscriptionFromStripeMock).not.toHaveBeenCalled();
  });

  it("syncs plan/status/period end for customer.subscription.updated", async () => {
    constructEventAsyncMock.mockResolvedValue(
      subscriptionEvent("customer.subscription.updated", { status: "active", priceId: "price_pro" }),
    );
    planForPriceIdMock.mockReturnValue("PROFESSIONAL");

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripeMock).toHaveBeenCalledWith("cus_123", {
      stripeSubscriptionId: "sub_123",
      plan: "PROFESSIONAL",
      status: "ACTIVE",
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
  });

  it("maps past_due and unpaid to PAST_DUE", async () => {
    constructEventAsyncMock.mockResolvedValue(subscriptionEvent("customer.subscription.updated", { status: "past_due" }));
    planForPriceIdMock.mockReturnValue("STARTER");

    await POST(webhookRequest());

    expect(syncSubscriptionFromStripeMock).toHaveBeenCalledWith("cus_123", expect.objectContaining({ status: "PAST_DUE" }));
  });

  it("maps canceled to CANCELLED on customer.subscription.deleted", async () => {
    constructEventAsyncMock.mockResolvedValue(subscriptionEvent("customer.subscription.deleted", { status: "canceled" }));
    planForPriceIdMock.mockReturnValue("BUSINESS");

    await POST(webhookRequest());

    expect(syncSubscriptionFromStripeMock).toHaveBeenCalledWith("cus_123", expect.objectContaining({ status: "CANCELLED" }));
  });

  it("skips syncing for a transient status like incomplete", async () => {
    constructEventAsyncMock.mockResolvedValue(subscriptionEvent("customer.subscription.updated", { status: "incomplete" }));

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripeMock).not.toHaveBeenCalled();
  });

  it("does not sync (and does not error) when the price id is unrecognized", async () => {
    constructEventAsyncMock.mockResolvedValue(
      subscriptionEvent("customer.subscription.updated", { priceId: "price_not_configured" }),
    );
    planForPriceIdMock.mockReturnValue(null);

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripeMock).not.toHaveBeenCalled();
  });

  it("ignores event types it doesn't act on", async () => {
    constructEventAsyncMock.mockResolvedValue({ type: "invoice.paid", data: { object: {} } });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripeMock).not.toHaveBeenCalled();
  });

  it("returns 500 so Stripe retries when the sync itself throws", async () => {
    constructEventAsyncMock.mockResolvedValue(subscriptionEvent("customer.subscription.updated"));
    planForPriceIdMock.mockReturnValue("PROFESSIONAL");
    syncSubscriptionFromStripeMock.mockRejectedValue(new Error("db unavailable"));

    const res = await POST(webhookRequest());

    expect(res.status).toBe(500);
  });
});
