import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const getUserMock = vi.fn();
const getMemberByUserIdMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/lib/db/organizations", () => ({
  getMemberByUserId: getMemberByUserIdMock,
}));

const getSubscriptionForOrgMock = vi.fn();

vi.mock("@/lib/db/subscriptions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/subscriptions")>("@/lib/db/subscriptions");
  return { ...actual, getSubscriptionForOrgViaSession: getSubscriptionForOrgMock };
});

const { getCurrentMember, requireMember, requireWritableMember, ApiError, apiErrorResponse } =
  await import("@/lib/auth");

const FAKE_MEMBER: OrgMember = {
  id: "member-1",
  orgId: "org-1",
  userId: "user-1",
  name: "Test Owner",
  email: "owner@test.com",
  role: "OWNER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  getUserMock.mockReset();
  getMemberByUserIdMock.mockReset();
  getSubscriptionForOrgMock.mockReset();
});

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    orgId: "org-1",
    plan: "PROFESSIONAL",
    status: "TRIALING",
    trialEndsAt: new Date(Date.now() + 7 * 86400000),
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("getCurrentMember", () => {
  it("returns null when there is no signed-in Supabase user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const member = await getCurrentMember();
    expect(member).toBeNull();
    // Must fail closed without ever querying org membership for an anonymous request.
    expect(getMemberByUserIdMock).not.toHaveBeenCalled();
  });

  it("looks up the org membership for the signed-in user's own id, not a client-supplied one", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getMemberByUserIdMock.mockResolvedValue(FAKE_MEMBER);

    const member = await getCurrentMember();

    expect(member).toEqual(FAKE_MEMBER);
    expect(getMemberByUserIdMock).toHaveBeenCalledWith("user-1", { activeOnly: true });
  });
});

describe("requireMember", () => {
  it("throws a 401 ApiError when nobody is signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(requireMember()).rejects.toMatchObject({ status: 401 });
  });

  it("throws a 403 ApiError when the member's role lacks the required permission", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getMemberByUserIdMock.mockResolvedValue({ ...FAKE_MEMBER, role: "VIEWER" });

    await expect(requireMember("deleteProjects")).rejects.toMatchObject({ status: 403 });
  });

  it("resolves with the member when the role has the required permission", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getMemberByUserIdMock.mockResolvedValue(FAKE_MEMBER); // OWNER

    const member = await requireMember("deleteProjects");
    expect(member.orgId).toBe("org-1");
  });

  it("resolves with the member when no permission is required (any signed-in role)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getMemberByUserIdMock.mockResolvedValue({ ...FAKE_MEMBER, role: "VIEWER" });

    const member = await requireMember();
    expect(member.role).toBe("VIEWER");
  });
});

describe("requireWritableMember", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getMemberByUserIdMock.mockResolvedValue(FAKE_MEMBER);
  });

  it("resolves during an active trial", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subscription());
    const member = await requireWritableMember();
    expect(member.orgId).toBe("org-1");
  });

  it("throws 402 once the trial has expired (workspace becomes read-only)", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subscription({ trialEndsAt: new Date(Date.now() - 1000) }));
    await expect(requireWritableMember()).rejects.toMatchObject({ status: 402 });
  });

  it("throws 402 for a cancelled subscription", async () => {
    getSubscriptionForOrgMock.mockResolvedValue(subscription({ status: "CANCELLED" }));
    await expect(requireWritableMember()).rejects.toMatchObject({ status: 402 });
  });

  it("still enforces role permissions before the billing check", async () => {
    getMemberByUserIdMock.mockResolvedValue({ ...FAKE_MEMBER, role: "VIEWER" });
    await expect(requireWritableMember("manageProjects")).rejects.toMatchObject({ status: 403 });
    expect(getSubscriptionForOrgMock).not.toHaveBeenCalled();
  });
});

describe("apiErrorResponse", () => {
  it("maps an ApiError to its declared status code and message", async () => {
    const res = apiErrorResponse(new ApiError(403, "no access"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no access" });
  });

  it("maps any other error to a generic 500 without leaking internal details", async () => {
    const res = apiErrorResponse(new Error("db connection string leaked here"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("leaked");
  });

  it("includes a correlation errorId in 500 responses so users can reference server logs", async () => {
    const res = apiErrorResponse(new Error("boom"));
    const body = await res.json();
    expect(body.errorId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gives each unexpected error a distinct errorId", async () => {
    const a = await apiErrorResponse(new Error("one")).json();
    const b = await apiErrorResponse(new Error("two")).json();
    expect(a.errorId).not.toBe(b.errorId);
  });
});

describe("apiErrorResponse: client disconnects", () => {
  it("does not mint a correlation id or log an error when the caller hung up", async () => {
    // A browser navigating away mid-request is routine. Treating it as a
    // server error would make it the loudest thing in the error stream.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = apiErrorResponse(new Error("aborted"));
    const body = await res.json();

    expect(res.status).toBe(499);
    expect(body.errorId).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.reason).toBe("client-disconnect");

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("treats ECONNRESET the same way", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const res = apiErrorResponse(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));

    expect(res.status).toBe(499);
    expect(errorSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("still returns 500 with a correlation id for a genuine failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = apiErrorResponse(new Error("column does not exist"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errorId).toEqual(expect.any(String));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
