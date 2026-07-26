import { defineConfig, devices } from "@playwright/test";

// Node's --env-file flag can't be reliably prepended to the `playwright`
// binary cross-platform (on Windows, node_modules/.bin/playwright is a
// POSIX shell shim, not JS, so `node .../playwright` fails outright). Load
// .env here instead — this runs before globalSetup and before webServer
// spawns (which inherits process.env), and it's a no-op in CI where the
// Supabase keys are already real env vars, not a .env file.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine in CI, where secrets come from the environment.
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share one seeded org; run serially to avoid data races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Pre-installed in this repo's environments — see AGENTS.md/CI setup.
        // Falls back to Playwright's own managed browser if unset (e.g. a
        // contributor's machine with `npx playwright install` already run).
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    // Always rebuild first — reusing a pre-existing .next build (or, worse,
    // an already-running server left on this port from a previous run) is
    // exactly how a stale build silently keeps failing on a fixed bug.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      // Test-only Stripe config. The webhook route verifies signatures with
      // HMAC-SHA256, which the spec can produce itself — so the real
      // verification, event routing and price->plan mapping all get
      // exercised without a Stripe account or any network call. The secret
      // key is only used to construct the client object.
      STRIPE_SECRET_KEY: "sk_test_e2e_not_a_real_key",
      STRIPE_WEBHOOK_SECRET: "whsec_e2e_test_secret",
      STRIPE_PRICE_STARTER: "price_e2e_starter",
      STRIPE_PRICE_PROFESSIONAL: "price_e2e_professional",
      STRIPE_PRICE_BUSINESS: "price_e2e_business",
    },
  },
});
