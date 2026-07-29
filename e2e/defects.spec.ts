import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { AUTH_STATE_PATH, SEED_INFO_PATH, adminClient, type SeedInfo } from "./seed";

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

test.describe.configure({ mode: "serial" });

let projectId: string;
let defectId: string;
let defectCode: string;

/**
 * SeedInfo carries auth-user ids, not org_members ids, and no display names.
 * The API assigns by member id and echoes back the name it resolved, so both
 * have to be looked up rather than assumed.
 */
const member: Record<string, { id: string; name: string }> = {};

test.beforeAll(async () => {
  const admin = adminClient();
  const userIds = [
    seed.orgA.members.OWNER.userId,
    seed.orgA.members.SITE_SUPERVISOR.userId,
    seed.orgB.owner.userId,
  ];
  const { data } = await admin.from("org_members").select("id, name, user_id").in("user_id", userIds);
  for (const row of data ?? []) {
    if (row.user_id === seed.orgA.members.OWNER.userId) member.OWNER = { id: row.id, name: row.name };
    if (row.user_id === seed.orgA.members.SITE_SUPERVISOR.userId) member.SUPERVISOR = { id: row.id, name: row.name };
    if (row.user_id === seed.orgB.owner.userId) member.ORG_B_OWNER = { id: row.id, name: row.name };
  }
  expect(member.OWNER?.id, "could not resolve the seeded owner's member row").toBeTruthy();
  expect(member.SUPERVISOR?.id, "could not resolve the seeded supervisor's member row").toBeTruthy();
  expect(member.ORG_B_OWNER?.id, "could not resolve org B's owner member row").toBeTruthy();
});

/**
 * Defect management, end to end.
 *
 * The rules worth proving here are the ones that only exist because a snag
 * list is evidence rather than a to-do list: the person who fixed it cannot
 * sign it off, a closed defect cannot be quietly reopened, and "resolved"
 * requires saying what was done.
 *
 * No describe-level test.use({ storageState }) — request contexts created via
 * playwright.request.newContext() inherit it, which would sign in the
 * signed-out test below. Each test states its own identity, the same way
 * tenant-isolation.spec.ts does.
 */
function ctxFor(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, statePath?: string) {
  return playwright.request.newContext({
    ...(statePath ? { storageState: statePath } : { storageState: undefined }),
    baseURL: test.info().project.use.baseURL,
  });
}

test.describe("defects", () => {
  test("a defect is raised with a location, a severity and an owner", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const project = await (
      await ctx.post("/api/projects", { data: { name: `Defect Site ${Date.now()}` } })
    ).json();
    projectId = project.project.id;

    const res = await ctx.post("/api/defects", {
      data: {
        projectId,
        title: "Cracked tiles in the lobby",
        location: "Blk A, Level 3, Unit 12",
        description: "Hairline cracks across four tiles by the lift.",
        severity: "HIGH",
        assignedToId: member.SUPERVISOR.id,
        dueDate: "2030-01-01",
      },
    });

    expect(res.status()).toBe(201);
    const { defect } = await res.json();
    defectId = defect.id;
    defectCode = defect.code;

    expect(defect.code).toMatch(/^DF-\d{3}$/);
    // Always OPEN on creation, whatever the caller asked for.
    expect(defect.status).toBe("OPEN");
    expect(defect.severity).toBe("HIGH");
    expect(defect.location).toBe("Blk A, Level 3, Unit 12");
    // The assignee's name is resolved server-side from the id, so it cannot
    // be set to someone who does not exist.
    expect(defect.assignedToName).toBe(member.SUPERVISOR.name);

    await ctx.dispose();
  });

  test("the caller cannot dictate the status, the code or who raised it", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const res = await ctx.post("/api/defects", {
      data: {
        projectId,
        title: "Attempted pre-closed defect",
        severity: "LOW",
        // All three ignored by the schema rather than trusted.
        status: "CLOSED",
        code: "DF-999",
        raisedByName: "Somebody Else",
      },
    });

    expect(res.status()).toBe(201);
    const { defect } = await res.json();
    // A defect that could be raised already closed is a record of nothing.
    expect(defect.status).toBe("OPEN");
    expect(defect.code).not.toBe("DF-999");
    expect(defect.raisedByName).toBe(member.OWNER.name);

    await ctx.dispose();
  });

  test("marking it resolved needs evidence, not just a click", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const bare = await ctx.patch(`/api/defects/${defectId}`, { data: { status: "RESOLVED" } });
    expect(bare.status()).toBe(400);
    expect((await bare.json()).error).toMatch(/say what was done|photo of the fix/i);

    const withNotes = await ctx.patch(`/api/defects/${defectId}`, {
      data: { status: "RESOLVED", resolutionNotes: "Tiles replaced and regrouted." },
    });
    expect(withNotes.status()).toBe(200);
    expect((await withNotes.json()).defect.status).toBe("RESOLVED");

    await ctx.dispose();
  });

  test("a Site Supervisor can resolve a defect but cannot sign it off", async ({ playwright }) => {
    // The point of a snag list: the person who fixed it is not the person
    // who agrees it is fixed.
    const ctx = await ctxFor(playwright, seed.orgA.members.SITE_SUPERVISOR.authStatePath);

    const res = await ctx.patch(`/api/defects/${defectId}`, { data: { status: "CLOSED" } });

    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/not close it/i);

    await ctx.dispose();
  });

  test("a Viewer cannot raise one at all", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, seed.orgA.members.VIEWER.authStatePath);

    const res = await ctx.post("/api/defects", {
      data: { projectId, title: "Viewer should not manage this", severity: "LOW" },
    });

    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("an Owner closes it, and the close-out is attributed and dated", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const res = await ctx.patch(`/api/defects/${defectId}`, { data: { status: "CLOSED" } });

    expect(res.status()).toBe(200);
    const { defect } = await res.json();
    expect(defect.status).toBe("CLOSED");
    // Set server-side, never accepted from the caller.
    expect(defect.closedByName).toBe(member.OWNER.name);
    expect(defect.closedAt).toBeTruthy();

    await ctx.dispose();
  });

  test("a closed defect cannot be quietly reopened", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    for (const status of ["OPEN", "IN_PROGRESS", "RESOLVED"]) {
      const res = await ctx.patch(`/api/defects/${defectId}`, { data: { status } });
      // Reopening would leave closedAt and closedByName describing an event
      // that is no longer true.
      expect(res.status(), `reopening as ${status}`).toBe(409);
      expect((await res.json()).error).toMatch(/closed/i);
    }

    await ctx.dispose();
  });

  test("a defect cannot be assigned to somebody in another workspace", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const res = await ctx.post("/api/defects", {
      data: {
        projectId,
        title: "Cross-tenant assignment attempt",
        severity: "LOW",
        assignedToId: member.ORG_B_OWNER.id,
      },
    });

    expect(res.status()).toBe(404);
    expect((await res.json()).error).toMatch(/not in this workspace/i);

    await ctx.dispose();
  });

  test("another tenant cannot read or touch it", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, seed.orgB.owner.authStatePath);

    expect((await ctx.get(`/api/defects/${defectId}`)).status()).toBe(404);
    expect((await ctx.patch(`/api/defects/${defectId}`, { data: { title: "Renamed" } })).status()).toBe(404);
    expect((await ctx.delete(`/api/defects/${defectId}`)).status()).toBe(404);

    // And it is absent from their list, not merely unreachable by id.
    const list = await (await ctx.get("/api/defects")).json();
    expect((list.defects ?? []).map((d: { code: string }) => d.code)).not.toContain(defectCode);

    await ctx.dispose();
  });

  test("a signed-out visitor gets nothing", async ({ playwright }) => {
    const ctx = await ctxFor(playwright);

    expect((await ctx.get("/api/defects")).status()).toBe(401);
    expect((await ctx.get(`/api/defects/${defectId}`)).status()).toBe(401);

    await ctx.dispose();
  });

  test("the owning tenant can still read its own, so the tests above are not false passes", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const res = await ctx.get(`/api/defects/${defectId}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).defect.code).toBe(defectCode);

    await ctx.dispose();
  });

});

/** Its own describe so the storageState below is not inherited by the
 *  request contexts above — including the signed-out one. */
test.describe("the defects page", () => {
  test.use({ storageState: AUTH_STATE_PATH });

  test("renders the snag list", async ({ page }) => {
    await page.goto("/defects");
    await expect(page.getByRole("heading", { name: /defects/i }).first()).toBeVisible();
    await expect(page.getByText(defectCode)).toBeVisible();
    await expect(page.getByText("Cracked tiles in the lobby")).toBeVisible();
  });
});
