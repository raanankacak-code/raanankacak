import type { Instrumentation } from "next";
import { reportError, logger } from "@/lib/logger";

/**
 * Server-side observability entry point (see the Next.js instrumentation.js
 * file convention).
 *
 * API routes already funnel their own failures through apiErrorResponse, but
 * that only covers what a route's try/catch sees. Errors thrown while
 * rendering a page or Server Component, or inside the proxy, never reach it —
 * before this hook those failed with a generic error page and nothing in the
 * logs to say what broke.
 */

/** Config the app cannot serve a single request without. */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function register() {
  // Where a hosted error tracker gets initialised, e.g.
  //   setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }))
  // Nothing is configured yet, so this deliberately stays a no-op rather than
  // shipping an inert SDK.

  // Fail at boot rather than on the first user request. A missing key
  // otherwise surfaces as an opaque runtime error somewhere deep in a route,
  // long after the deploy looked successful.
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const message = `Missing required environment variable(s): ${missing.join(", ")}. See .env.example.`;
    logger.error("Startup configuration invalid", { missing });
    throw new Error(message);
  }

  logger.info("Server starting", {
    runtime: process.env.NEXT_RUNTIME,
    nodeEnv: process.env.NODE_ENV,
    trustedProxyHops: Number(process.env.TRUSTED_PROXY_HOPS ?? "1"),
  });
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  // `digest` is React's identifier for an error that passed through Server
  // Component rendering, where the original instance is no longer available.
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  reportError("Unhandled server error", err, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    ...(digest ? { digest } : {}),
  });
};
