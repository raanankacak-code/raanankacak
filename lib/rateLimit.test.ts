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
  it("reads the first address from x-forwarded-for", () => {
    const req = new Request("http://localhost/", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
    expect(getClientIp(req)).toBe("203.0.113.5");
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
