import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getOrganizationByIdMock = vi.fn();
const getSubscriptionForOrgMock = vi.fn();
const setStripeCustomerIdMock = vi.fn();
const priceIdForPlanMock = vi.fn();
const customersCreateMock = vi.fn();
const checkoutSessionsCreateMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock };
});

vi.mock("@/lib/db/organizations", () => ({
  getOrganizationById: getOrganizationByIdMock,
}));

vi.mock("@/lib/db/subscriptions", () => ({
  getSubscriptionForOrg: getSubscriptionForOrgMock,
  setStripeCustomerId: setStripeCustomerIdMock,
}));

vi.mock("@/lib/billing/stripe", () => ({
  priceIdForPlan: priceIdForPlanMock,
  getStripeClient: () => ({
    customers: { create: customersCreateMock },
    checkout: { sessions: { create: checkoutSessionsCreateMock } },
  }),
}));

const { POST } = await import("@/app/api/billing/checkout/route");

const MEMBER: OrgMember = {
  id: "member-1",
  orgId: "org-A",
  userId: "user-1",
  name: "Owner Person",
  email: "owner@org-a.test",
  role: "OWNER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getOrganizationByIdMock.mockReset();
  getSubscriptionForOrgMock.mockReset();
  setStripeCustomerIdMock.mockReset();
  priceIdForPlanMock.mockReset();
  customersCreateMock.mockReset();
  checkoutSessionsCreateMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
  getOrganizationByIdMock.mockResolvedValue({ name: "Test Contractor Sdn Bhd" });
});

describe("POST /api/billing/checkout", () => {
  it("returns 500 with an upgrade-support message when the plan has no configured Stripe price", async () => {
    priceIdForPlanMock.mockReturnValue(null);

    const res = await POST(postRequest({ plan: "STARTER" }));

    expect(res.status).toBe(500);
    expect(checkoutSessionsCreateMock).not.toHaveBeenCalled();
  });

  it("creates a Stripe customer and stores its id when the org has none yet", async () => {
    priceIdForPlanMock.mockReturnValue("price_pro");
    getSubscriptionForOrgMock.mockResolvedValue({ stripeCustomerId: null });
    customersCreateMock.mockResolvedValue({ id: "cus_new" });
    checkoutSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/session" });

    await POST(postRequest({ plan: "PROFESSIONAL" }));

    expect(customersCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@org-a.test", metadata: { orgId: "org-A" } }),
    );
    expect(setStripeCustomerIdMock).toHaveBeenCalledWith("org-A", "cus_new");
    expect(checkoutSessionsCreateMock).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_new" }));
  });

  it("reuses an existing Stripe customer instead of creating a new one", async () => {
    priceIdForPlanMock.mockReturnValue("price_pro");
    getSubscriptionForOrgMock.mockResolvedValue({ stripeCustomerId: "cus_existing" });
    checkoutSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/session" });

    await POST(postRequest({ plan: "PROFESSIONAL" }));

    expect(customersCreateMock).not.toHaveBeenCalled();
    expect(checkoutSessionsCreateMock).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_existing" }));
  });

  it("returns the session url on success", async () => {
    priceIdForPlanMock.mockReturnValue("price_pro");
    getSubscriptionForOrgMock.mockResolvedValue({ stripeCustomerId: "cus_existing" });
    checkoutSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });

    const res = await POST(postRequest({ plan: "PROFESSIONAL" }));
    const body = await res.json();

    expect(body).toEqual({ url: "https://checkout.stripe.com/session_abc" });
  });

  it("requires the manageOrg permission", async () => {
    requireMemberMock.mockRejectedValue(new Error("should be ApiError in real code, mock is fine here"));
    priceIdForPlanMock.mockReturnValue("price_pro");

    await POST(postRequest({ plan: "PROFESSIONAL" }));

    expect(requireMemberMock).toHaveBeenCalledWith("manageOrg");
  });
});
