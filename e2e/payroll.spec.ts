import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { AUTH_STATE_PATH, SEED_INFO_PATH, adminClient, type SeedInfo } from "./seed";

/**
 * The monthly payroll figures.
 *
 * The invariant is the one a bug broke: the wages column has to add up to
 * the "Payroll this month" total printed above it. Rounded to the ringgit,
 * each cell rounded on its own and four workers at RM 155 for 12.5 days
 * showed four rows of RM 1,938 under a header of RM 7,750 — two out, and
 * more with a bigger crew. That figure is reconciled against a bank
 * transfer.
 *
 * Nothing here asserts a particular currency string. It parses what is on
 * the screen and checks the arithmetic, so the test still means something
 * if the format changes again.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

test.use({ storageState: AUTH_STATE_PATH });

/** Half a day at an odd rate is where the sen come from. */
const DAILY_RATE = 155;
const PROJECT_NAME = `E2E Payroll ${Date.now()}`;

let projectId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const orgId = seed.orgA.id;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({ org_id: orgId, name: PROJECT_NAME, status: "ACTIVE", progress_pct: 0 })
    .select("id")
    .single();
  if (projectError) throw projectError;
  projectId = project.id;

  const { data: workers, error: workerError } = await admin
    .from("workers")
    .insert(
      ["Payroll One", "Payroll Two", "Payroll Three"].map((name) => ({
        org_id: orgId,
        project_id: projectId,
        name: `${name} ${Date.now()}`,
        trade: "General",
        daily_rate: DAILY_RATE,
        active: true,
      })),
    )
    .select("id");
  if (workerError) throw workerError;

  // An odd number of half days, so each worker's wages land on .50 and the
  // column cannot agree with its total by accident.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const iso = (dayOfMonth: number) =>
    new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), dayOfMonth, 12))
      .toISOString()
      .slice(0, 10);

  const records = [];
  for (const worker of workers) {
    for (let day = 1; day <= 7; day++) {
      records.push({
        org_id: orgId,
        project_id: projectId,
        worker_id: worker.id,
        date: iso(day),
        // Days 1, 3, 5: half. Days 2, 4, 6, 7: full. Three halves is odd,
        // so the total carries .50.
        status: day <= 5 && day % 2 === 1 ? "HALF_DAY" : "PRESENT",
      });
    }
  }
  const { error: attendanceError } = await admin.from("attendance_records").insert(records);
  if (attendanceError) throw attendanceError;
});

test.afterAll(async () => {
  // Workers and attendance cascade with the project.
  if (projectId) await adminClient().from("projects").delete().eq("id", projectId);
});

/** "RM 1,937.50" -> 1937.5, whatever spacing Intl used. */
function parseMoney(text: string): number {
  const digits = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  return Number.parseFloat(digits);
}

test.describe("monthly payroll", () => {
  test("the wages column adds up to the payroll total above it", async ({ page }) => {
    await page.goto("/attendance");
    await page.click('button:has-text("Monthly summary")');
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });

    const cells = page.locator('td[data-label="Wages"]');
    await expect(cells.first()).toBeVisible({ timeout: 15000 });

    const wages = (await cells.allTextContents()).map(parseMoney);
    expect(wages.length).toBeGreaterThan(0);
    for (const w of wages) expect(Number.isFinite(w)).toBe(true);

    const headerText = await page.locator("text=Payroll this month").textContent();
    const total = parseMoney(headerText ?? "");

    // Compared in sen, so floating point cannot make a true sum look false.
    const summed = Math.round(wages.reduce((a, b) => a + b, 0) * 100);
    expect(summed, `column sums to ${summed / 100}, header says ${total}`).toBe(Math.round(total * 100));
  });

  test("a half day is worth half a day's wage, to the sen", async ({ page }) => {
    await page.goto("/attendance");
    await page.click('button:has-text("Monthly summary")');
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });

    const row = page.locator("tr", { hasText: "Payroll One" }).first();
    await expect(row).toBeVisible({ timeout: 15000 });

    const days = Number.parseFloat((await row.locator('td[data-label="Days worked"]').textContent()) ?? "");
    const wages = parseMoney((await row.locator('td[data-label="Wages"]').textContent()) ?? "");

    // 4 full + 3 half = 5.5 days at RM 155 = RM 852.50. The .5 is the point:
    // rounded to the ringgit this cell read 853 and stopped matching.
    expect(days).toBe(5.5);
    expect(wages).toBeCloseTo(5.5 * DAILY_RATE, 2);
  });
});
