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

/** Best-effort client IP from standard proxy headers — no built-in equivalent
 * in Next.js Route Handlers, so this depends on the reverse proxy in front of
 * the app setting one of these (true of most self-hosted setups). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
