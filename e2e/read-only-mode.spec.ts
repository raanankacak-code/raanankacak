import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, type SeedInfo } from "./seed";

/**
 * Read-only mode after a trial expires.
 *
 * The promise made to customers on the Billing page is specific: "All data is
 * safe and can still be viewed and exported." That is worth holding to —
 * locking someone out of their own site records over a lapsed card would be
 * far worse than refusing a write. Until now this path was covered only by
 * unit tests against isSubscriptionWritable, never end to end.
 *
 * Org C is seeded with an already-expired trial so nothing has to be mutated
 * mid-run.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

function expiredOrgContext() {
  return {
    storageState: seed.orgC.owner.authStatePath,
    baseURL: test.info().project.use.baseURL,
  };
}

test.describe("expired trial: read-only, not locked out", () => {
  test("reading still works", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(expiredOrgContext());

    expect((await ctx.get("/api/projects")).ok()).toBeTruthy();
    expect((await ctx.get("/api/reports")).ok()).toBeTruthy();
    expect((await ctx.get("/api/calendar")).ok()).toBeTruthy();
    // Billing has to stay reachable — it is where they go to fix this.
    expect((await ctx.get("/api/billing")).ok()).toBeTruthy();

    await ctx.dispose();
  });

  test("writes are refused with 402, pointing at billing", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(expiredOrgContext());

    const res = await ctx.post("/api/projects", { data: { name: "should not be created" } });

    expect(res.status()).toBe(402);
    expect((await res.json()).error).toMatch(/trial has ended|read-only/i);

    await ctx.dispose();
  });

  test("every write path is closed, not just project creation", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(expiredOrgContext());
    const today = new Date().toISOString().slice(0, 10);

    const attempts = [
      ctx.post("/api/calendar", {
        data: { type: "MEETING", title: "x", date: today, priority: "LOW" },
      }),
      ctx.post("/api/reports", { data: { projectId: seed.orgC.id, date: today, workDone: "x" } }),
      ctx.post("/api/uploads", {
        multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([1]) } },
      }),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status(), `${res.url()} should be payment-required`).toBe(402);
    }

    await ctx.dispose();
  });

  test("the billing page explains the state rather than erroring", async ({ browser }) => {
    const page = await browser.newPage({ storageState: seed.orgC.owner.authStatePath });

    await page.goto("/billing");
    await expect(page.getByText(/read-only/i).first()).toBeVisible();
    await expect(page.getByText(/data is safe/i).first()).toBeVisible();

    await page.close();
  });

  test("a healthy org is unaffected", async ({ playwright }) => {
    // Guards against a change that accidentally puts everyone in read-only.
    const ctx = await playwright.request.newContext({
      storageState: seed.orgA.members.OWNER.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    expect((await ctx.post("/api/projects", { data: { name: "Healthy org project" } })).ok()).toBeTruthy();

    await ctx.dispose();
  });
});
