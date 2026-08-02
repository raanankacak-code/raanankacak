import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { AUTH_STATE_PATH, SEED_INFO_PATH, type SeedInfo } from "./seed";

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

test.describe.configure({ mode: "serial" });

const today = new Date().toISOString().slice(0, 10);

function items(fails: number, total = 6) {
  return Array.from({ length: total }, (_, i) => ({
    category: "PPE",
    item: `Check ${i + 1}`,
    result: i < fails ? "FAIL" : "PASS",
    ...(i < fails ? { note: `finding ${i + 1}` } : {}),
  }));
}

let projectId: string;
let cleanInspectionId: string;
let failingInspectionId: string;

// No describe-level test.use({ storageState }): request contexts created via
// `playwright.request.newContext()` inherit it, which quietly signs in the
// "signed-out visitor" test. Each test below states its own identity instead,
// the same way tenant-isolation.spec.ts does.
test.describe("safety inspections", () => {
  test("a clean inspection is filed as a pass and closed on arrival", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    const project = await (
      await ctx.post("/api/projects", { data: { name: `Safety Site ${Date.now()}` } })
    ).json();
    projectId = project.project.id;

    const res = await ctx.post("/api/safety", {
      data: { projectId, date: today, items: items(0) },
    });
    expect(res.status()).toBe(201);
    const { inspection } = await res.json();
    cleanInspectionId = inspection.id;

    expect(inspection.outcome).toBe("PASS");
    expect(inspection.failedCount).toBe(0);
    // Nothing to action, so there is nothing to leave open.
    expect(inspection.status).toBe("CLOSED");
    expect(inspection.code).toMatch(/^SI-\d{3}$/);

    await ctx.dispose();
  });

  test("failures drive the outcome, and the caller cannot dictate it", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    // A caller trying to file a failing inspection as a pass. The schema
    // ignores `outcome`/`status`, and the server derives both from the items.
    const res = await ctx.post("/api/safety", {
      data: {
        projectId,
        date: today,
        items: items(2),
        outcome: "PASS",
        status: "CLOSED",
        failedCount: 0,
      },
    });
    expect(res.status()).toBe(201);
    const { inspection } = await res.json();
    failingInspectionId = inspection.id;

    expect(inspection.outcome).toBe("ACTIONS_REQUIRED");
    expect(inspection.failedCount).toBe(2);
    expect(inspection.status).toBe("OPEN");

    // Five or more is a different judgement, not just more of the same.
    const bad = await ctx.post("/api/safety", {
      data: { projectId, date: today, items: items(5, 8) },
    });
    expect((await bad.json()).inspection.outcome).toBe("FAIL");

    await ctx.dispose();
  });

  test("an open inspection can be closed once, and not twice", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    const first = await ctx.patch(`/api/safety/${failingInspectionId}`, { data: { status: "CLOSED" } });
    expect(first.ok()).toBeTruthy();
    expect((await first.json()).inspection.status).toBe("CLOSED");

    const second = await ctx.patch(`/api/safety/${failingInspectionId}`, { data: { status: "CLOSED" } });
    expect(second.status()).toBe(409);

    await ctx.dispose();
  });

  test("the checklist cannot be edited after filing", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    // The whole value of the record is that it says what was found on the
    // day. Reopening it, or rewriting the items, is refused.
    for (const data of [{ status: "OPEN" }, { items: items(0) }, { outcome: "PASS" }]) {
      const res = await ctx.patch(`/api/safety/${cleanInspectionId}`, { data });
      expect(res.ok(), JSON.stringify(data)).toBeFalsy();
    }

    const unchanged = await (await ctx.get(`/api/safety/${cleanInspectionId}`)).json();
    expect(unchanged.inspection.status).toBe("CLOSED");
    expect(unchanged.inspection.outcome).toBe("PASS");

    await ctx.dispose();
  });

  test("another tenant cannot read or close this org's inspections", async ({ playwright }) => {
    const ctx: APIRequestContext = await playwright.request.newContext({
      storageState: seed.orgB.owner.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    expect((await ctx.get(`/api/safety/${cleanInspectionId}`)).status()).toBe(404);
    expect((await ctx.patch(`/api/safety/${failingInspectionId}`, { data: { status: "CLOSED" } })).status()).toBe(404);
    expect((await ctx.delete(`/api/safety/${cleanInspectionId}`)).status()).toBe(404);

    const list = await (await ctx.get("/api/safety")).json();
    expect(list.inspections.map((i: { id: string }) => i.id)).not.toContain(cleanInspectionId);

    await ctx.dispose();
  });

  test("evidence attached to a finding survives, and is swept when the record goes", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    const png = { name: "finding.png", mimeType: "image/png", buffer: Buffer.from([1, 2, 3, 4]) };
    const findingUrl = (await (await ctx.post("/api/uploads", { multipart: { file: png } })).json()).url;
    const siteUrl = (await (await ctx.post("/api/uploads", { multipart: { file: png } })).json()).url;

    const filed = await ctx.post("/api/safety", {
      data: {
        projectId,
        date: today,
        photos: [siteUrl],
        items: [
          { category: "PPE", item: "Hard hats", result: "FAIL", note: "two without", photos: [findingUrl] },
          { category: "PPE", item: "Boots", result: "PASS" },
        ],
      },
    });
    expect(filed.status()).toBe(201);
    const id = (await filed.json()).inspection.id;

    // The evidence has to come back attached to the finding it belongs to,
    // not pooled at the bottom of the record.
    const fetched = (await (await ctx.get(`/api/safety/${id}`)).json()).inspection;
    expect(fetched.photos).toEqual([siteUrl]);
    expect(fetched.items[0].photos).toEqual([findingUrl]);
    expect(fetched.items[1].photos).toBeUndefined();

    const removed = await ctx.delete(`/api/safety/${id}`);
    expect(removed.status(), await removed.text()).toBe(200);

    // These URLs are deliberately not read before the delete. Uploaded objects
    // are served `immutable, max-age=31536000` — correct, since their names
    // are UUIDs and their bytes never change — and Playwright honours it, so
    // a read beforehand is answered from cache afterwards and the assertion
    // passes whether or not the sweep ran. A fresh request context does not
    // help; the cache outlives it. Read them only once, here.
    //
    // Per-finding photos are the ones easy to miss when sweeping storage,
    // which is why they get their own assertion.
    expect((await ctx.get(findingUrl)).status(), "per-finding evidence was orphaned").toBe(404);
    expect((await ctx.get(siteUrl)).status(), "site photo was orphaned").toBe(404);

    await ctx.dispose();
  });

  test("a photo can be added after filing, and after closing", async ({ playwright }) => {
    // The photograph of the fix arrives the next day. Until this it lived in
    // somebody's phone gallery, which is not a record.
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    const png = { name: "after.png", mimeType: "image/png", buffer: Buffer.from([9, 9, 9, 9]) };
    const url = (await (await ctx.post("/api/uploads", { multipart: { file: png } })).json()).url as string;

    const before = (await (await ctx.get(`/api/safety/${cleanInspectionId}`)).json()).inspection;
    // cleanInspectionId is CLOSED on arrival — a clean inspection has nothing
    // to action — which is exactly the case that has to keep working.
    expect(before.status).toBe("CLOSED");

    const res = await ctx.post(`/api/safety/${cleanInspectionId}/photos`, { data: { photos: [url] } });
    expect(res.status(), await res.text()).toBe(200);

    const after = (await res.json()).inspection;
    expect(after.photos).toContain(url);
    // The checklist is untouched: this route can add evidence and nothing
    // else, so what was found on site cannot be revised afterwards.
    expect(after.items).toEqual(before.items);
    expect(after.outcome).toBe(before.outcome);
    expect(after.status).toBe(before.status);

    await ctx.dispose();
  });

  test("the same photo twice does not appear twice", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });
    const existing = (await (await ctx.get(`/api/safety/${cleanInspectionId}`)).json()).inspection.photos as string[];
    const res = await ctx.post(`/api/safety/${cleanInspectionId}/photos`, { data: { photos: [existing[0]] } });
    expect(res.status()).toBe(200);
    expect((await res.json()).inspection.photos).toEqual(existing);
    await ctx.dispose();
  });

  test("a Viewer cannot add evidence to a safety record", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: seed.orgA.members.VIEWER.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });
    const res = await ctx.post(`/api/safety/${cleanInspectionId}/photos`, {
      data: { photos: ["/api/uploads/whatever/x.png"] },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("a Site Supervisor can add one but cannot take one away", async ({ playwright }) => {
    // Adding evidence is part of filing; removing it from a safety record is
    // not a routine act, so it sits with the roles that close inspections.
    const ctx = await playwright.request.newContext({
      storageState: seed.orgA.members.SITE_SUPERVISOR.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    const png = { name: "supervisor.png", mimeType: "image/png", buffer: Buffer.from([7, 7, 7, 7]) };
    const url = (await (await ctx.post("/api/uploads", { multipart: { file: png } })).json()).url as string;

    expect((await ctx.post(`/api/safety/${cleanInspectionId}/photos`, { data: { photos: [url] } })).status()).toBe(200);
    expect((await ctx.delete(`/api/safety/${cleanInspectionId}/photos`, { data: { url } })).status()).toBe(403);

    await ctx.dispose();
  });

  test("removing one takes the file with it, and only from this record", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    const png = { name: "mistake.png", mimeType: "image/png", buffer: Buffer.from([3, 3, 3, 3]) };
    const url = (await (await ctx.post("/api/uploads", { multipart: { file: png } })).json()).url as string;
    await ctx.post(`/api/safety/${cleanInspectionId}/photos`, { data: { photos: [url] } });

    // A url that is not on this inspection is not this route's to delete.
    const stranger = await ctx.delete(`/api/safety/${cleanInspectionId}/photos`, {
      data: { url: "/api/uploads/00000000-0000-0000-0000-000000000000/nope.png" },
    });
    expect(stranger.status()).toBe(404);

    const removed = await ctx.delete(`/api/safety/${cleanInspectionId}/photos`, { data: { url } });
    expect(removed.status(), await removed.text()).toBe(200);
    expect((await removed.json()).inspection.photos).not.toContain(url);

    // The object goes too: a row that no longer points at it leaves an
    // orphan, and an orphan still counts against the workspace's quota.
    // Read once, after the delete — uploads are served immutable, so a read
    // beforehand would be answered from cache.
    expect((await ctx.get(url)).status(), "the removed photo was orphaned in storage").toBe(404);

    await ctx.dispose();
  });

  test("another tenant cannot add evidence to this org's inspection", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: seed.orgB.owner.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });
    const res = await ctx.post(`/api/safety/${cleanInspectionId}/photos`, {
      data: { photos: ["/api/uploads/x/y.png"] },
    });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });

  test("the record is on the company's own letterhead", async ({ playwright, browser }) => {
    // What an officer is handed should say who the contractor is, with the
    // two numbers a Malaysian contractor is identified by.
    const api = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });
    const saved = await api.patch("/api/orgs", {
      data: { ssmNumber: "202301234567", cidbNumber: "0120230101-SW123456", phone: "082-123456" },
    });
    expect(saved.ok(), "could not set the company details, so this proves nothing").toBeTruthy();
    await api.dispose();

    const page = await (await browser.newContext({ storageState: AUTH_STATE_PATH })).newPage();
    await page.goto(`/safety/${cleanInspectionId}`);

    await expect(page.locator(".letterhead-name")).toContainText(seed.orgA.name.slice(0, 20));
    await expect(page.getByText("SSM 202301234567")).toBeVisible();
    await expect(page.getByText(/CIDB 0120230101-SW123456/)).toBeVisible();
    // And the document still says what it is.
    await expect(page.getByRole("heading", { name: /safety inspection record/i })).toBeVisible();

    await page.close();
  });

  test("the full record page shows everything checked, not only what failed", async ({ browser }) => {
    // The artefact handed to an officer. "We looked at all of this" is half of
    // what an inspection record is for, so passes must be on it too.
    const page = await (await browser.newContext({ storageState: AUTH_STATE_PATH })).newPage();
    await page.goto(`/safety/${cleanInspectionId}`);

    await expect(page.getByRole("heading", { name: /safety inspection record/i })).toBeVisible();
    await expect(page.getByText("SI-001")).toBeVisible();
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible();

    // Six checklist rows were filed; all six appear.
    for (let i = 1; i <= 6; i++) {
      await expect(page.getByText(`Check ${i}`, { exact: true })).toBeVisible();
    }

    await page.close();
  });

  test("another tenant cannot open the record page either", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: seed.orgB.owner.authStatePath })).newPage();
    await page.goto(`/safety/${cleanInspectionId}`);

    await expect(page.getByText(/nothing here/i)).toBeVisible();
    await expect(page.getByText("SI-001")).toHaveCount(0);

    await page.close();
  });

  test("a signed-out visitor gets nothing", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });

    expect((await ctx.get("/api/safety")).status()).toBe(401);
    expect((await ctx.get(`/api/safety/${cleanInspectionId}`)).status()).toBe(401);

    await ctx.dispose();
  });

  test("the owning tenant can still read its own, so the test above is not a false pass", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    expect((await ctx.get(`/api/safety/${cleanInspectionId}`)).ok()).toBeTruthy();

    // Clean up the project this spec created, which cascades its inspections.
    await ctx.delete(`/api/projects/${projectId}`);
    await ctx.dispose();
  });
});
