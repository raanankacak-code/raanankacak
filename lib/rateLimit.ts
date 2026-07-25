import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by Postgres, keyed by a caller-supplied
 * string (e.g. `${route}:${ip}` or `${route}:${userId}`).
 *
 * The store is shared, which is the whole point: an earlier version kept
 * buckets in process memory, so every replica enforced its own budget (N
 * replicas meant roughly N times the intended limit) and a restart forgot
 * them entirely. That made the limits decorative in any deployment bigger
 * than one instance — including the one defence against brute-forcing an
 * invite token.
 *
 * The check and the increment happen inside a single SQL statement in
 * check_rate_limit(), so two concurrent requests cannot both read the same
 * count and both be let through.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    // Rate limiting is a guard, not the feature the caller asked for.
    // Failing their request because the limiter is unavailable turns a
    // storage blip into an outage, so allow and record it instead — the
    // routes behind this are all authenticated or otherwise bounded.
    logger.error("Rate limit check failed; allowing request", { key, message: error.message });
    return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    logger.error("Rate limit check returned no row; allowing request", { key });
    return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
  }

  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: row.retry_after_seconds,
  };
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
