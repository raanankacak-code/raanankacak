import { describe, expect, it } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  it("allows requests up to the limit within the window", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000, now).allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    checkRateLimit(key, 2, 60_000, now);
    checkRateLimit(key, 2, 60_000, now);
    const third = checkRateLimit(key, 2, 60_000, now);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the count once the window has elapsed", () => {
    const key = `test-${Math.random()}`;
    const start = 1_000_000;
    checkRateLimit(key, 1, 60_000, start);
    expect(checkRateLimit(key, 1, 60_000, start + 30_000).allowed).toBe(false);
    expect(checkRateLimit(key, 1, 60_000, start + 60_001).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const base = `test-${Math.random()}`;
    const now = 1_000_000;
    checkRateLimit(`${base}-a`, 1, 60_000, now);
    expect(checkRateLimit(`${base}-a`, 1, 60_000, now).allowed).toBe(false);
    expect(checkRateLimit(`${base}-b`, 1, 60_000, now).allowed).toBe(true);
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
