import { beforeEach, describe, expect, it, vi } from "vitest";

const getInviteByTokenMock = vi.fn();
const getOrganizationByIdMock = vi.fn();

vi.mock("@/lib/db/team", () => ({
  getInviteByToken: getInviteByTokenMock,
}));

vi.mock("@/lib/db/organizations", () => ({
  getOrganizationById: getOrganizationByIdMock,
}));

const { GET } = await import("@/app/api/invites/[token]/route");

function requestFrom(ip: string) {
  return new Request("http://localhost/api/invites/tok-abc", { headers: { "x-forwarded-for": ip } });
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  getInviteByTokenMock.mockReset();
  getOrganizationByIdMock.mockReset();
  getInviteByTokenMock.mockResolvedValue(null); // 404 path is fine for these rate-limit tests
});

describe("GET /api/invites/[token] rate limiting", () => {
  it("allows the first 20 lookups from one IP within the window", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 20; i++) {
      const res = await GET(requestFrom(ip), paramsFor("tok-abc"));
      expect(res.status).not.toBe(429);
    }
  });

  it("blocks the 21st lookup from the same IP within the window", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    for (let i = 0; i < 20; i++) {
      await GET(requestFrom(ip), paramsFor("tok-abc"));
    }
    const res = await GET(requestFrom(ip), paramsFor("tok-abc"));
    expect(res.status).toBe(429);
  });

  it("does not rate-limit a different IP", async () => {
    const ipA = `198.51.100.${Math.floor(Math.random() * 100) + 100}`;
    const ipB = `198.51.100.${Math.floor(Math.random() * 100) + 150}`;
    for (let i = 0; i < 20; i++) {
      await GET(requestFrom(ipA), paramsFor("tok-abc"));
    }
    const blocked = await GET(requestFrom(ipA), paramsFor("tok-abc"));
    const stillAllowed = await GET(requestFrom(ipB), paramsFor("tok-abc"));
    expect(blocked.status).toBe(429);
    expect(stillAllowed.status).not.toBe(429);
  });
});
