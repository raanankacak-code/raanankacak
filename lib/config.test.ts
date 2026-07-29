import { describe, expect, it } from "vitest";
import { checkConfig } from "@/lib/config";

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

// A *complete* production config now includes error alerting: shipping
// without it is a defensible choice, but not a complete one.
const PROD = {
  ...SUPABASE,
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  SENTRY_DSN: "https://key@o1.ingest.sentry.io/1",
};

function check(env: Record<string, string | undefined>) {
  return checkConfig(env as NodeJS.ProcessEnv);
}

describe("checkConfig", () => {
  it("passes on a complete production config", () => {
    const { fatal, warnings } = check({ ...PROD, TRUSTED_PROXY_HOPS: "1" });
    expect(fatal).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("fails on each missing Supabase key, naming it", () => {
    const { fatal } = check({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://a.example" });
    expect(fatal).toHaveLength(3);
    expect(fatal.join(" ")).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  describe("NEXT_PUBLIC_APP_URL", () => {
    it("is fatal in production, because its absence is invisible at runtime", () => {
      // The app still starts and still serves requests without it — it just
      // builds invite links from a header the caller controls.
      const { fatal } = check({ ...SUPABASE, NODE_ENV: "production" });
      expect(fatal.join(" ")).toContain("NEXT_PUBLIC_APP_URL");
      expect(fatal.join(" ")).toContain("Host header");
    });

    it("is only a warning outside production, so local dev still runs", () => {
      const { fatal, warnings } = check({ ...SUPABASE, NODE_ENV: "development" });
      expect(fatal).toEqual([]);
      expect(warnings.join(" ")).toContain("NEXT_PUBLIC_APP_URL");
    });

    it("rejects a value that is not a URL at all", () => {
      const { fatal } = check({ ...PROD, NEXT_PUBLIC_APP_URL: "app.example.com" });
      expect(fatal.join(" ")).toContain("not a valid URL");
    });

    it("rejects http in production — the invite link would be a token in plaintext", () => {
      const { fatal } = check({ ...PROD, NEXT_PUBLIC_APP_URL: "http://app.example.com" });
      expect(fatal.join(" ")).toContain("must be https");
    });

    it("allows http on localhost even in a production build", () => {
      // A production build served on loopback is normal — the e2e suite does
      // exactly this, and so does a smoke test against a release candidate.
      for (const url of ["http://localhost:3100", "http://127.0.0.1:3000"]) {
        const { fatal } = check({ ...PROD, NEXT_PUBLIC_APP_URL: url, TRUSTED_PROXY_HOPS: "1" });
        expect(fatal, url).toEqual([]);
      }
    });

    it("allows http outside production, for localhost", () => {
      const { fatal } = check({ ...SUPABASE, NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
      expect(fatal).toEqual([]);
    });
  });

  describe("TRUSTED_PROXY_HOPS", () => {
    it("warns when unset in production rather than failing — 1 is a defensible default", () => {
      const { fatal, warnings } = check(PROD);
      expect(fatal).toEqual([]);
      expect(warnings.join(" ")).toContain("TRUSTED_PROXY_HOPS");
    });

    it("is fatal when set to something that is not a number", () => {
      // A wrong value is worse than an absent one: Number("two") is NaN, and
      // the rate limiter would silently fall back to trusting the whole chain.
      const { fatal } = check({ ...PROD, TRUSTED_PROXY_HOPS: "two" });
      expect(fatal.join(" ")).toContain("whole number");
    });

    it("is fatal when negative", () => {
      const { fatal } = check({ ...PROD, TRUSTED_PROXY_HOPS: "-1" });
      expect(fatal.join(" ")).toContain("whole number");
    });

    it("accepts 0, for an app genuinely exposed with no proxy", () => {
      const { fatal } = check({ ...PROD, TRUSTED_PROXY_HOPS: "0" });
      expect(fatal).toEqual([]);
    });
  });

  describe("half-configured integrations", () => {
    it("refuses Stripe with no webhook secret", () => {
      // Checkout would appear to work and the subscription would never
      // activate, leaving someone who has paid stuck in read-only.
      const { fatal } = check({ ...PROD, TRUSTED_PROXY_HOPS: "1", STRIPE_SECRET_KEY: "sk_live_x" });
      expect(fatal.join(" ")).toContain("STRIPE_WEBHOOK_SECRET");
    });

    it("accepts Stripe fully configured", () => {
      const { fatal } = check({
        ...PROD,
        TRUSTED_PROXY_HOPS: "1",
        STRIPE_SECRET_KEY: "sk_live_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      });
      expect(fatal).toEqual([]);
    });

    it("warns about a test Stripe key in a production build", () => {
      const { warnings } = check({
        ...PROD,
        TRUSTED_PROXY_HOPS: "1",
        STRIPE_SECRET_KEY: "sk_test_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      });
      expect(warnings.join(" ")).toContain("test key");
    });

    it("warns when a from-address is set but no email key", () => {
      const { fatal, warnings } = check({ ...PROD, TRUSTED_PROXY_HOPS: "1", RESEND_FROM_EMAIL: "a@b.test" });
      expect(fatal).toEqual([]);
      expect(warnings.join(" ")).toContain("RESEND_API_KEY");
    });

    it("says nothing when email is simply not configured at all", () => {
      const { fatal, warnings } = check({ ...PROD, TRUSTED_PROXY_HOPS: "1" });
      expect(fatal).toEqual([]);
      expect(warnings).toEqual([]);
    });
  });

  describe("SENTRY_DSN", () => {
    it("warns in production when absent, because nothing will tell you the app is failing", () => {
      const { fatal, warnings } = check({ ...PROD, SENTRY_DSN: undefined, TRUSTED_PROXY_HOPS: "1" });

      // A warning, not fatal: running without alerting is a real choice, and
      // the app also says so at boot.
      expect(fatal).toEqual([]);
      expect(warnings.join(" ")).toContain("SENTRY_DSN");
    });

    it("is silent outside production, where nobody is watching anyway", () => {
      const { warnings } = check({ ...SUPABASE, NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
      expect(warnings.join(" ")).not.toContain("SENTRY_DSN");
    });

    it("is fatal when malformed, rather than quietly reporting nothing", () => {
      // The dangerous state is not "no alerting" — it is believing you have
      // alerting. A typo produces exactly that, and nothing anywhere would
      // contradict it.
      const { fatal } = check({ ...PROD, SENTRY_DSN: "https://ingest.sentry.io/1", TRUSTED_PROXY_HOPS: "1" });
      expect(fatal.join(" ")).toContain("SENTRY_DSN");
      expect(fatal.join(" ")).toContain("silently go unreported");
    });

    it("accepts a real DSN", () => {
      const { fatal } = check({ ...PROD, TRUSTED_PROXY_HOPS: "1" });
      expect(fatal).toEqual([]);
    });
  });
});
