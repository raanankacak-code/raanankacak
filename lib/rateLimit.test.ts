import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const createAdminClientMock = vi.fn(() => ({ rpc: rpcMock }));
const errorMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/logger", () => ({
  logger: { error: errorMock, warn: vi.fn(), info: vi.fn() },
  errorFields: () => ({}),
}));

const { checkRateLimit, getClientIp } = await import("@/lib/rateLimit");

beforeEach(() => {
  rpcMock.mockReset();
  errorMock.mockReset();
});

describe("checkRateLimit", () => {
  it("asks the shared store to decide, rather than any local state", () => {
    // The decision has to live somewhere every replica can see: an
    // in-memory bucket gives each instance its own budget, so N replicas
    // enforce roughly N times the intended limit.
    rpcMock.mockResolvedValue({ data: [{ allowed: true, remaining: 2, retry_after_seconds: 0 }], error: null });

    return checkRateLimit("invite-lookup:1.2.3.4", 3, 60_000).then(() => {
      expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
        p_key: "invite-lookup:1.2.3.4",
        p_limit: 3,
        p_window_ms: 60_000,
      });
    });
  });

  it("passes the store's verdict straight through", async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, remaining: 0, retry_after_seconds: 42 }], error: null });

    await expect(checkRateLimit("k", 1, 1000)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
  });

  it("accepts a single row as well as an array", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, remaining: 5, retry_after_seconds: 0 }, error: null });

    await expect(checkRateLimit("k", 10, 1000)).resolves.toMatchObject({ allowed: true, remaining: 5 });
  });

  it("allows the request when the store itself fails, and says so", async () => {
    // Rate limiting is a guard, not the thing the caller asked for. Turning
    // a storage blip into a 429 for every user would be a worse outage than
    // briefly not counting.
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(checkRateLimit("k", 1, 1000)).resolves.toMatchObject({ allowed: true });
    expect(errorMock).toHaveBeenCalled();
  });

  it("allows the request when the store returns nothing at all", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(checkRateLimit("k", 1, 1000)).resolves.toMatchObject({ allowed: true });
    expect(errorMock).toHaveBeenCalled();
  });
});

describe("getClientIp", () => {
  function withXff(value: string) {
    return new Request("http://localhost/", { headers: { "x-forwarded-for": value } });
  }

  it("takes the address the trusted proxy appended, not the caller's claim", () => {
    // "203.0.113.5" here is whatever the caller sent; "10.0.0.1" is what our
    // own proxy observed. Trusting the former would let anyone rotate the
    // header to get an unlimited rate-limit budget.
    expect(getClientIp(withXff("203.0.113.5, 10.0.0.1"))).toBe("10.0.0.1");
  });

  it("ignores a spoofed chain of any length", () => {
    expect(getClientIp(withXff("1.1.1.1, 2.2.2.2, 3.3.3.3, 10.0.0.7"))).toBe("10.0.0.7");
  });

  it("gives a spoofing caller a stable key rather than a fresh one per request", () => {
    // Two requests with different forged prefixes must land on the same
    // bucket, otherwise the rate limit is bypassable by rotation alone.
    const a = getClientIp(withXff("9.9.9.9, 10.0.0.4"));
    const b = getClientIp(withXff("8.8.8.8, 10.0.0.4"));
    expect(a).toBe(b);
  });

  it("honours TRUSTED_PROXY_HOPS for multi-proxy setups", () => {
    const previous = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "2";
    try {
      // CDN appended the client, load balancer appended the CDN.
      expect(getClientIp(withXff("1.1.1.1, 203.0.113.5, 10.0.0.1"))).toBe("203.0.113.5");
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = previous;
    }
  });

  it("fails closed onto one shared bucket when the chain is shorter than the configured topology", () => {
    const previous = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "3";
    try {
      // Fewer entries than expected means the request did not traverse the
      // proxies we trust, so nothing in the header is vouched for. Forging a
      // short header must not buy a fresh bucket per request.
      const a = getClientIp(withXff("203.0.113.5, 10.0.0.1"));
      const b = getClientIp(withXff("198.51.100.9"));
      expect(a).toBe(b);
      expect(a).not.toContain("203.0.113.5");
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = previous;
    }
  });

  it("handles a single-entry header and stray whitespace", () => {
    expect(getClientIp(withXff("  10.0.0.3  "))).toBe("10.0.0.3");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost/", { headers: { "x-real-ip": "203.0.113.9" } });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const req = new Request("http://localhost/");
    expect(getClientIp(req)).toBe("unknown");
  });
});
