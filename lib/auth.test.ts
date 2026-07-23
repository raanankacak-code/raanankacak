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

const { getCurrentMember, requireMember, ApiError, apiErrorResponse } = await import("@/lib/auth");

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
});

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
});
