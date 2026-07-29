import { parseDsn } from "@/lib/errorReporting";

/**
 * Startup configuration checks.
 *
 * Separate from instrumentation.ts so the rules can be tested directly — a
 * boot check that has never been seen to fail is a boot check nobody should
 * trust.
 *
 * The distinction between fatal and warning is deliberate. Fatal is for
 * config whose absence is *invisible at runtime*: the app starts, serves
 * requests, and quietly does the wrong thing. A warning is for config where
 * the default is defensible and the operator may genuinely have meant it.
 */

/** Config the app cannot serve a single request without. */
const ALWAYS_REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export interface ConfigReport {
  fatal: string[];
  warnings: string[];
}

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  for (const name of ALWAYS_REQUIRED) {
    if (!env[name]) fatal.push(`${name} is not set. See .env.example.`);
  }

  // NEXT_PUBLIC_APP_URL — fatal in production.
  //
  // Without it, invite links and Stripe return URLs fall back to the request's
  // Host header, which a proxy that does not pin Host lets a caller choose.
  // That puts an attacker's domain in the "Accept invitation" button of an
  // email that is otherwise genuinely from this deployment. The app still
  // starts and still works, which is exactly why this has to be loud: nothing
  // about the running system looks wrong.
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    const message =
      "NEXT_PUBLIC_APP_URL is not set. Invite links and Stripe return URLs would be built from the request's Host header, which a caller can forge. Set it to this deployment's public origin, e.g. https://app.your-domain.com";
    if (isProduction) fatal.push(message);
    else warnings.push(`${message} (not fatal outside production)`);
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(appUrl);
    } catch {
      fatal.push(`NEXT_PUBLIC_APP_URL is not a valid URL: ${appUrl}`);
    }
    // http is only acceptable when it points at the machine itself — a
    // production build served on localhost is a normal thing (the e2e suite,
    // a smoke test against a release candidate). Over a real network, an
    // invite link on http is a token in plaintext.
    const isLoopback = parsed !== null && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
    if (parsed && isProduction && parsed.protocol !== "https:" && !isLoopback) {
      fatal.push(`NEXT_PUBLIC_APP_URL must be https outside localhost, got ${parsed.protocol}//${parsed.host}`);
    }
  }

  // TRUSTED_PROXY_HOPS — warn when unset, fatal when nonsense.
  //
  // A warning rather than fatal because 1 is a defensible default: one
  // reverse proxy is the common deployment. A wrong value is worse than an
  // absent one, though — too high lets a caller forge their IP past the rate
  // limiter, too low puts everyone behind the proxy in one shared bucket.
  const hops = env.TRUSTED_PROXY_HOPS;
  if (hops === undefined || hops === "") {
    if (isProduction) {
      warnings.push(
        "TRUSTED_PROXY_HOPS is not set — defaulting to 1. Set it to the number of proxies actually in front of this app; too high lets callers forge their IP past the rate limiter.",
      );
    }
  } else if (!/^\d+$/.test(hops)) {
    fatal.push(`TRUSTED_PROXY_HOPS must be a whole number, got "${hops}".`);
  }

  // Stripe is optional, but half-configured is worse than absent: checkout
  // would appear to work and then fail, or webhooks would arrive unverified.
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    fatal.push(
      "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not. Subscription changes would never be applied, leaving paying customers read-only.",
    );
  }
  if (isProduction && env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    warnings.push("STRIPE_SECRET_KEY is a test key, in a production build.");
  }

  // SENTRY_DSN — fatal when malformed, a warning when absent in production.
  //
  // Absent is a defensible choice and the app says so at boot. A *typo* is
  // not: nothing would report, nothing would complain, and you would carry
  // on believing you had alerting. That belief is worse than knowing you
  // have none, so it refuses to start instead.
  const dsn = env.SENTRY_DSN;
  if (dsn) {
    if (!parseDsn(dsn)) {
      fatal.push(
        "SENTRY_DSN is set but is not a valid Sentry DSN (expected https://<key>@<host>/<projectId>). Errors would silently go unreported.",
      );
    }
  } else if (isProduction) {
    warnings.push(
      "SENTRY_DSN is not set — errors are logged to stdout and nowhere else. Nothing will alert you when the app throws.",
    );
  }

  // Email is optional — invites still work via the copyable link, and the UI
  // now says so — but an operator who set a from-address probably meant to
  // send mail.
  if (env.RESEND_FROM_EMAIL && !env.RESEND_API_KEY) {
    warnings.push("RESEND_FROM_EMAIL is set but RESEND_API_KEY is not — no invitation emails will be sent.");
  }

  return { fatal, warnings };
}
