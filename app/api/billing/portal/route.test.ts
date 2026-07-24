import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getSubscriptionForOrgMock = vi.fn();
const billingPortalSessionsCreateMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock };
});

vi.mock("@/lib/db/subscriptions", () => ({
  getSubscriptionForOrg: getSubscriptionForOrgMock,
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({ billingPortal: { sessions: { create: billingPortalSessionsCreateMock } } }),
}));

const { POST } = await import("@/app/api/billing/portal/route");

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

function postRequest() {
  return new Request("http://localhost/api/billing/portal", { method: "POST" });
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getSubscriptionForOrgMock.mockReset();
  billingPortalSessionsCreateMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
});

describe("POST /api/billing/portal", () => {
  it("returns 400 when the org has never checked out (no Stripe customer yet)", async () => {
    getSubscriptionForOrgMock.mockResolvedValue({ stripeCustomerId: null });

    const res = await POST(postRequest());

    expect(res.status).toBe(400);
    expect(billingPortalSessionsCreateMock).not.toHaveBeenCalled();
  });

  it("opens a portal session for the org's Stripe customer and returns its url", async () => {
    getSubscriptionForOrgMock.mockResolvedValue({ stripeCustomerId: "cus_existing" });
    billingPortalSessionsCreateMock.mockResolvedValue({ url: "https://billing.stripe.com/session_xyz" });

    const res = await POST(postRequest());
    const body = await res.json();

    expect(billingPortalSessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
    expect(body).toEqual({ url: "https://billing.stripe.com/session_xyz" });
  });
});
