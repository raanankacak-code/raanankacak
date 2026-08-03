import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, type SeedInfo } from "./seed";

/**
 * The permission matrix, enforced against the real API rather than asserted
 * against lib/permissions.ts in isolation.
 *
 * A unit test proves the matrix says the right thing; it cannot prove a
 * route actually consults it. Both calendar and upload shipped without a
 * role check despite the matrix being correct all along.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));
const today = () => new Date().toISOString().slice(0, 10);

function contextFor(role: keyof SeedInfo["orgA"]["members"] | string) {
  return {
    storageState: seed.orgA.members[role].authStatePath,
    baseURL: test.info().project.use.baseURL,
  };
}

test.describe("permissions: Viewer is read-only", () => {
  test("can read the workspace", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(contextFor("VIEWER"));

    expect((await ctx.get("/api/projects")).ok()).toBeTruthy();
    expect((await ctx.get("/api/calendar")).ok()).toBeTruthy();

    await ctx.dispose();
  });

  test("cannot create, edit or delete calendar events", async ({ playwright }) => {
    // A Viewer is documented as read-only access for clients, consultants
    // and auditors. Before this was guarded, one could have deleted the
    // whole company's calendar.
    const supervisor = await playwright.request.newContext(contextFor("SITE_SUPERVISOR"));
    const made = await supervisor.post("/api/calendar", {
      data: { type: "MEETING", title: "Scheduled by supervisor", date: today(), priority: "LOW" },
    });
    expect(made.ok()).toBeTruthy();
    const eventId = (await made.json()).event.id;
    await supervisor.dispose();

    const viewer = await playwright.request.newContext(contextFor("VIEWER"));

    expect(
      (
        await viewer.post("/api/calendar", {
          data: { type: "MEETING", title: "by viewer", date: today(), priority: "LOW" },
        })
      ).status(),
    ).toBe(403);
    expect((await viewer.patch(`/api/calendar/${eventId}`, { data: { title: "edited" } })).status()).toBe(403);
    expect((await viewer.delete(`/api/calendar/${eventId}`)).status()).toBe(403);

    await viewer.dispose();
  });

  test("cannot create projects or submit reports", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(contextFor("VIEWER"));

    expect((await ctx.post("/api/projects", { data: { name: "by viewer" } })).status()).toBe(403);
    expect(
      (
        await ctx.post("/api/reports", {
          data: { projectId: seed.orgA.id, date: today(), workDone: "by viewer" },
        })
      ).status(),
    ).toBe(403);

    await ctx.dispose();
  });

  test("cannot upload files", async ({ playwright }) => {
    // Nothing a Viewer could attach a file to, so storing one would only
    // consume the org's storage quota.
    const ctx = await playwright.request.newContext(contextFor("VIEWER"));

    const res = await ctx.post("/api/uploads", {
      multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([1]) } },
    });

    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});

test.describe("permissions: Site Supervisor can do its job", () => {
  test("can manage the calendar and upload report photos", async ({ playwright }) => {
    // The mirror of the Viewer tests: restricting a role is only correct if
    // the roles that need the feature still have it.
    const ctx = await playwright.request.newContext(contextFor("SITE_SUPERVISOR"));

    const created = await ctx.post("/api/calendar", {
      data: { type: "DELIVERY", title: "Cement delivery", date: today(), priority: "MEDIUM" },
    });
    expect(created.ok()).toBeTruthy();
    const eventId = (await created.json()).event.id;

    expect((await ctx.patch(`/api/calendar/${eventId}`, { data: { title: "Cement delivery (moved)" } })).ok()).toBeTruthy();
    expect((await ctx.delete(`/api/calendar/${eventId}`)).ok()).toBeTruthy();

    const upload = await ctx.post("/api/uploads", {
      multipart: { file: { name: "site.png", mimeType: "image/png", buffer: Buffer.from([1, 2]) } },
    });
    expect(upload.ok()).toBeTruthy();

    await ctx.dispose();
  });

  test("still cannot manage team members or billing", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(contextFor("SITE_SUPERVISOR"));

    expect((await ctx.get("/api/team/invites")).status()).toBe(403);
    expect((await ctx.get("/api/billing")).status()).toBe(403);

    await ctx.dispose();
  });
});

/**
 * The other half of the matrix: the pages, not the routes behind them.
 *
 * The API has refused these roles all along. What it could not do was stop
 * the app showing someone a button they could not use, then a form they
 * could not submit — which is worse than a plain "no", because they fill it
 * in first.
 */
test.describe("permissions: the form pages, not just the API behind them", () => {
  let projectId: string;
  let workerId: string;

  test.beforeAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(contextFor("OWNER"));
    projectId = (
      await (await owner.post("/api/projects", { data: { name: `Guarded Pages ${Date.now()}` } })).json()
    ).project.id;
    workerId = (
      await (
        await owner.post(`/api/projects/${projectId}/workers`, {
          data: { name: "Azlan bin Osman", trade: "Concretor", dailyRate: 120 },
        })
      ).json()
    ).worker.id;
    await owner.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(contextFor("OWNER"));
    await owner.delete(`/api/projects/${projectId}`);
    await owner.dispose();
  });

  /** The five URLs, and where each should send someone who cannot use it. */
  function formPages() {
    return [
      { path: "/projects/new", back: /\/projects$/ },
      { path: `/projects/${projectId}/edit`, back: new RegExp(`/projects/${projectId}$`) },
      { path: `/projects/${projectId}/workers/new`, back: /tab=workers/ },
      { path: `/projects/${projectId}/workers/${workerId}/edit`, back: /tab=workers/ },
      { path: "/reports/new", back: /\/reports$/ },
    ];
  }

  for (const role of ["VIEWER", "SITE_SUPERVISOR"] as const) {
    test(`a ${role} is turned away from the forms it cannot submit`, async ({ browser }) => {
      const page = await (await browser.newContext(contextFor(role))).newPage();

      for (const { path, back } of formPages()) {
        // A Site Supervisor may file reports, so that one page is theirs.
        const allowed = role === "SITE_SUPERVISOR" && path === "/reports/new";
        await page.goto(path);
        if (allowed) {
          await expect(page, `${role} should be able to open ${path}`).toHaveURL(new RegExp(path));
        } else {
          await expect(page, `${role} was left sitting on ${path}`).toHaveURL(back);
          // Not merely redirected — the form must not be on the screen.
          await expect(page.locator("form")).toHaveCount(0);
        }
      }

      await page.context().close();
    });
  }

  test("an Owner still gets every one of them", async ({ browser }) => {
    // Shutting a door on the wrong people is only half of it.
    const page = await (await browser.newContext(contextFor("OWNER"))).newPage();

    for (const { path } of formPages()) {
      await page.goto(path);
      await expect(page, `the Owner was turned away from ${path}`).toHaveURL(new RegExp(path.split("?")[0]));
      await expect(page.locator("form")).toHaveCount(1);
    }

    await page.context().close();
  });

  test("the dashboard offers New project once, and only to those who can", async ({ browser }) => {
    const owner = await (await browser.newContext(contextFor("OWNER"))).newPage();
    await owner.goto("/dashboard");
    // It used to appear twice: once in the topbar, once in the quick actions
    // below it, differently capitalised each time.
    await expect(owner.locator('a[href="/projects/new"]')).toHaveCount(1);
    await owner.context().close();

    for (const role of ["VIEWER", "SITE_SUPERVISOR"] as const) {
      const page = await (await browser.newContext(contextFor(role))).newPage();
      await page.goto("/dashboard");
      await page.locator("h2").first().waitFor();
      await expect(page.locator('a[href="/projects/new"]'), `${role} is offered New project`).toHaveCount(0);
      await page.context().close();
    }
  });
});
