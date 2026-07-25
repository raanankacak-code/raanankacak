interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Simple in-memory fixed-window rate limiter, keyed by caller-supplied string
 * (e.g. `${route}:${ip}` or `${route}:${userId}`). This works within a single
 * Node process, matching this app's current self-hosted deployment model
 * (see the "Phase 1" note in lib/uploads.ts) — it does not share state across
 * multiple instances/replicas. Swap for a shared store (Redis/Upstash) before
 * horizontally scaling.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Client IP for rate-limit keying, read from proxy headers (Next.js Route
 * Handlers expose no socket address).
 *
 * X-Forwarded-For is a client-supplied header that each proxy *appends* to,
 * so the leftmost entry is whatever the caller claimed and is worthless for
 * rate limiting — an attacker can rotate it per request and get an unlimited
 * budget. Only the entries your own infrastructure appended can be trusted,
 * so we count in from the right: with one reverse proxy in front of the app
 * (the default), the last entry is the address that proxy actually saw.
 *
 * Set TRUSTED_PROXY_HOPS to the number of proxies in front of this app (e.g.
 * 2 behind a CDN plus a load balancer). Too high and callers fail closed into
 * one shared bucket; too low and they can spoof again.
 *
 * IMPORTANT: this only holds if the app is not directly reachable. Route
 * Handlers expose no socket address, so X-Forwarded-For is the only signal
 * available — if clients can bypass the proxy and talk to the app directly,
 * they control the whole header and per-IP limiting cannot be enforced.
 * Bind the app to localhost (or a private network) behind the proxy.
 */
export function getClientIp(request: Request): string {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  const trustedHops = Number.isFinite(hops) && hops >= 1 ? Math.floor(hops) : 1;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // A chain shorter than the configured topology did not come through the
    // proxies we expect, so nothing in it is vouched for. Fail closed onto a
    // single shared bucket instead of trusting a caller-supplied value —
    // otherwise forging a short header buys a fresh bucket per request.
    if (parts.length >= trustedHops) {
      return parts[parts.length - trustedHops];
    }
    return "untrusted-forwarded-for";
  }

  // Single-value headers set by the immediate proxy — not caller-appendable
  // in the same way, so usable as-is.
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
