import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, type SeedInfo } from "./seed";

/**
 * Cross-tenant access, attempted for real against a second seeded org.
 *
 * Tenant isolation is enforced in three overlapping places — the app's own
 * org_id filters, Postgres row-level security, and the org check on the file
 * download route. All three were verified during development with throwaway
 * scripts that no longer exist; this is the standing regression net.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

test.describe.configure({ mode: "serial" });

/** Whatever org A creates here is what org B will try to reach. */
let projectId: string;
let fileUrl: string;
let reportId: string;

test.describe("tenant isolation", () => {
  test("org A creates data another tenant must never see", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: seed.orgA.members.OWNER.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    const project = await ctx.post("/api/projects", { data: { name: "Isolation Project" } });
    expect(project.ok()).toBeTruthy();
    projectId = (await project.json()).project.id;

    const upload = await ctx.post("/api/uploads", {
      multipart: {
        file: { name: "secret.png", mimeType: "image/png", buffer: Buffer.from([1, 2, 3, 4]) },
      },
    });
    expect(upload.ok()).toBeTruthy();
    fileUrl = (await upload.json()).url;

    const report = await ctx.post("/api/reports", {
      data: {
        projectId,
        date: new Date().toISOString().slice(0, 10),
        workDone: "Confidential site notes",
      },
    });
    expect(report.ok()).toBeTruthy();
    reportId = (await report.json()).report.id;

    await ctx.dispose();
  });

  test("a different tenant cannot read any of it", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: seed.orgB.owner.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    // Direct fetches by id — the ids are known, so only the server-side org
    // check stands between org B and the data.
    expect((await ctx.get(`/api/projects/${projectId}`)).status()).toBe(404);
    expect((await ctx.get(`/api/reports/${reportId}`)).status()).toBe(404);
    expect((await ctx.get(fileUrl)).status()).toBe(404);

    await ctx.dispose();
  });

  test("listing endpoints never include another tenant's rows", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: seed.orgB.owner.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    const projects = await (await ctx.get("/api/projects")).json();
    expect(projects.projects.map((p: { id: string }) => p.id)).not.toContain(projectId);

    const reports = await (await ctx.get("/api/reports")).json();
    expect(reports.reports.map((r: { id: string }) => r.id)).not.toContain(reportId);

    await ctx.dispose();
  });

  test("a signed-out visitor gets nothing at all", async ({ playwright }) => {
    const ctx: APIRequestContext = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });

    for (const path of [`/api/projects/${projectId}`, `/api/reports/${reportId}`, fileUrl]) {
      expect(
        (await ctx.get(path)).status(),
        `${path} should require authentication`,
      ).toBe(401);
    }

    await ctx.dispose();
  });

  test("the owning tenant can still read its own data", async ({ playwright }) => {
    // The isolation checks above would also pass if everything were broken,
    // so prove the happy path still works.
    const ctx = await playwright.request.newContext({
      storageState: seed.orgA.members.OWNER.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });

    expect((await ctx.get(`/api/projects/${projectId}`)).ok()).toBeTruthy();
    expect((await ctx.get(`/api/reports/${reportId}`)).ok()).toBeTruthy();

    const file = await ctx.get(fileUrl);
    expect(file.ok()).toBeTruthy();
    expect(Buffer.from(await file.body())).toEqual(Buffer.from([1, 2, 3, 4]));

    await ctx.dispose();
  });
});
