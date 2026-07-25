import { beforeEach, describe, expect, it, vi } from "vitest";

const getInviteByTokenMock = vi.fn();
const getOrganizationByIdMock = vi.fn();

vi.mock("@/lib/db/team", () => ({
  getInviteByToken: getInviteByTokenMock,
}));

vi.mock("@/lib/db/organizations", () => ({
  getOrganizationById: getOrganizationByIdMock,
}));

const checkRateLimitMock = vi.fn();

vi.mock("@/lib/rateLimit", async () => {
  // Keep the real getClientIp so the key this route builds is still the one
  // under test; only the shared-store call is faked.
  const actual = await vi.importActual<typeof import("@/lib/rateLimit")>("@/lib/rateLimit");
  return { ...actual, checkRateLimit: checkRateLimitMock };
});

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
  checkRateLimitMock.mockReset();
  getInviteByTokenMock.mockResolvedValue(null); // 404 path is fine for these rate-limit tests
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
});

describe("GET /api/invites/[token] rate limiting", () => {
  // The counting itself now lives in Postgres (check_rate_limit) and is
  // covered by lib/rateLimit.test.ts plus a live concurrency check. What
  // matters here is that this route asks, keys the question by client IP,
  // and honours the answer.
  it("keys the limit by the client's IP, not by the token", async () => {
    await GET(requestFrom("198.51.101.1"), paramsFor("tok-abc"));

    expect(checkRateLimitMock).toHaveBeenCalledWith("invite-lookup:198.51.101.1", 20, 60_000);
  });

  it("gives two different IPs two different buckets", async () => {
    await GET(requestFrom("198.51.101.1"), paramsFor("tok-abc"));
    await GET(requestFrom("198.51.102.1"), paramsFor("tok-abc"));

    const keys = checkRateLimitMock.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
  });

  it("serves the lookup when the limiter allows it", async () => {
    const res = await GET(requestFrom("198.51.101.1"), paramsFor("tok-abc"));

    expect(res.status).not.toBe(429);
  });

  it("refuses with 429 when the limiter says no", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 30 });

    const res = await GET(requestFrom("198.51.103.1"), paramsFor("tok-abc"));

    expect(res.status).toBe(429);
    // The token must not be looked up at all once the caller is over the
    // limit — otherwise the limit does nothing to slow down guessing.
    expect(getInviteByTokenMock).not.toHaveBeenCalled();
  });
});
