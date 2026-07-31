import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { AUTH_STATE_PATH, SEED_INFO_PATH, type SeedInfo } from "./seed";

test.use({ storageState: AUTH_STATE_PATH });

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

// One long serial flow instead of independent tests — each step's data
// (the project, the worker) is what the next step operates on, matching
// how a contractor would actually use the app end to end.
test.describe.configure({ mode: "serial" });

/**
 * Fail loudly on a Content-Security-Policy violation anywhere in the flow.
 *
 * Without this a too-strict CSP shows up only indirectly — a blocked script
 * means a dead button, which surfaces as a confusing timeout somewhere far
 * from the cause. The browser reports the actual violation, so assert on it.
 */
test.beforeEach(async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(text)) {
      violations.push(text);
    }
  });
  page.on("pageerror", (err) => violations.push(`pageerror: ${err.message}`));

  // Playwright has no afterEach hook on `page`, so surface them at teardown
  // of the fixture by attaching to the test's own info object.
  (page as unknown as { __violations: string[] }).__violations = violations;
});

test.afterEach(async ({ page }) => {
  const violations = (page as unknown as { __violations?: string[] }).__violations ?? [];
  expect(violations, `CSP or page errors:\n${violations.join("\n")}`).toEqual([]);
});

test.describe("golden path: signup through approval", () => {
  test("dashboard loads for the seeded org", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.locator(".side")).toContainText(seed.orgName.slice(0, 20));
  });

  test("create a project", async ({ page }) => {
    await page.goto("/projects/new");
    await page.fill("#name", "E2E Riverside Towers");
    await page.fill("#client", "E2E Test Client Sdn Bhd");
    await page.fill("#value", "2500000");
    await page.click('button[type="submit"]');

    // Not /projects/[^/]+$ — that also matches the form this submit came
    // from, so the wait would return immediately and the assertion below
    // would race the navigation. It usually won, which is the worst kind of
    // flake: one that only fails on a slow machine, months later.
    await page.waitForURL(/\/projects\/(?!new$)[^/]+$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "E2E Riverside Towers" })).toBeVisible();
  });

  test("add a worker to the project", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("row", { name: /E2E Riverside Towers/ }).click();
    await page.waitForURL(/\/projects\/[^/]+$/);

    await page.click('a:has-text("Workers")');
    await page.waitForURL(/tab=workers/);
    await page.click('a:has-text("+ Add worker")');
    await page.waitForURL(/\/workers\/new$/);

    await page.fill("#name", "E2E Test Worker");
    await page.fill("#trade", "Bricklayer");
    await page.fill("#rate", "180");
    await page.click('button[type="submit"]');

    await page.waitForURL(/tab=workers/, { timeout: 15000 });
    await expect(page.getByText("E2E Test Worker")).toBeVisible();
  });

  test("submit a daily report", async ({ page }) => {
    await page.goto("/reports/new");
    // The only project in this seeded org auto-selects.
    await expect(page.locator("#project")).toHaveValue(/.+/);
    await page.fill("#work", "E2E: completed formwork on level 3.");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/reports\/[^/]+$/, { timeout: 15000 });
    await expect(page.getByText("E2E: completed formwork on level 3.")).toBeVisible();
  });

  test("take attendance for the worker", async ({ page }) => {
    await page.goto("/attendance");
    await page.waitForSelector(".proj-select");
    await expect(page.getByText("E2E Test Worker")).toBeVisible({ timeout: 15000 });

    await page.click('button:has-text("Mark all present")');
    await page.click('button:has-text("Save attendance")');
    await expect(page.getByText("Saving…")).toHaveCount(0, { timeout: 10000 });
  });

  test("submit and approve a material request", async ({ page }) => {
    await page.goto("/materials");
    await page.click('button:has-text("New request")');

    await page.fill('input[placeholder="e.g. Cement (OPC 50kg)"]', "E2E Cement OPC 50kg");
    await page.fill('input[placeholder="0"]', "100");
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await page.fill('input[type="date"]', nextWeek);
    await page.fill('textarea[placeholder*="work front"]', "E2E: needed for column pours.");
    await page.click('button:has-text("Submit for approval")');

    await expect(page.getByText("E2E Cement OPC 50kg")).toBeVisible({ timeout: 15000 });
    await page.click("text=E2E Cement OPC 50kg");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Approve/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(page.getByText("APPROVED").first()).toBeVisible({ timeout: 15000 });
  });

  test("the approval appears on the audit log", async ({ page }) => {
    await page.goto("/audit-log");
    await expect(page.getByText(/marked material request .* as approved/i)).toBeVisible({ timeout: 15000 });
  });

  test("billing page shows the active trial", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByText("Professional").first()).toBeVisible();
    await expect(page.getByText(/day.*left in your free trial/)).toBeVisible();
  });
});
