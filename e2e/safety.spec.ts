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
