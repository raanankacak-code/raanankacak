import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, adminClient, createAuthedUser, deleteUsers, type SeedInfo } from "./seed";

/**
 * Exporting a workspace, and deleting one.
 *
 * Deletion is the only irreversible action in the app, so the guards around
 * it are the point: Owner-only, and the company name has to be typed
 * correctly. Both are tested by trying to get past them.
 *
 * The deletion test builds its own throwaway org rather than using a seeded
 * one — the seeded fixtures are shared with every other spec, and this test
 * destroys what it touches.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

test.describe.configure({ mode: "serial" });

function ctxFor(storageState: string) {
  return { storageState, baseURL: test.info().project.use.baseURL };
}

test.afterAll(async () => {
  const admin = adminClient();
  for (const orgId of createdOrgIds) {
    // deleted_workspaces and legal_acceptances have no foreign key to
    // organizations — deliberately, so their records outlive the workspace.
    // That means the delete below does not reach them and this test would
    // otherwise leave rows in the live project on every run.
    await admin.from("deleted_workspaces").delete().eq("org_id", orgId);
    await admin.from("legal_acceptances").delete().eq("org_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  await deleteUsers(createdUserIds);
});

test.describe("data export", () => {
  test("an owner gets every part of their workspace", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(ctxFor(seed.orgA.members.OWNER.authStatePath));

    const res = await ctx.get("/api/orgs/export");

    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-disposition"]).toContain("attachment");
    // The whole workspace in one response — a shared cache must not keep it.
    expect(res.headers()["cache-control"]).toContain("no-store");

    const data = await res.json();
    expect(data.organization.id).toBe(seed.orgA.id);
    // Every section present, so a customer migrating away can tell whether
    // something is genuinely empty or silently missing.
    for (const key of [
      "members",
      "invites",
      "projects",
      "workers",
      "attendance",
      "dailyReports",
      "materialRequests",
      "materialRequestEvents",
      "documents",
      "calendarEvents",
      "notifications",
      "bugReports",
      "auditLog",
    ]) {
      expect(Array.isArray(data[key]), `${key} should be an array`).toBe(true);
    }
    expect(data.members.length).toBeGreaterThan(0);

    await ctx.dispose();
  });

  test("it contains no other tenant's rows", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(ctxFor(seed.orgB.owner.authStatePath));

    const data = await (await ctx.get("/api/orgs/export")).json();

    expect(data.organization.id).toBe(seed.orgB.id);
    const foreign = [...data.members, ...data.projects].filter(
      (row: { org_id?: string }) => row.org_id && row.org_id !== seed.orgB.id,
    );
    expect(foreign).toEqual([]);

    await ctx.dispose();
  });

  test("pending invitation codes are not included", async ({ playwright }) => {
    // An export gets emailed around and dropped in shared drives. An invite
    // token is a bearer credential — anyone holding it can join the
    // workspace, so it must not travel in the file.
    const owner = await playwright.request.newContext(ctxFor(seed.orgA.members.OWNER.authStatePath));
    const invited = await owner.post("/api/team/invites", {
      data: { name: "Export Invitee", email: `e2e-export-${Date.now()}@example.com`, role: "VIEWER" },
    });
    const realToken = (await invited.json()).invite.token;

    const raw = await (await owner.get("/api/orgs/export")).text();

    expect(raw).not.toContain(realToken);
    expect(JSON.parse(raw).invites.some((i: { token: string }) => i.token === "[redacted]")).toBe(true);

    await owner.dispose();
  });

  test("it still works when the workspace is read-only", async ({ playwright }) => {
    // This is the promise the Billing page makes when a trial lapses:
    // "all data is safe and can still be viewed and exported".
    const ctx = await playwright.request.newContext(ctxFor(seed.orgC.owner.authStatePath));

    const res = await ctx.get("/api/orgs/export");

    expect(res.ok()).toBeTruthy();
    expect((await res.json()).organization.id).toBe(seed.orgC.id);

    await ctx.dispose();
  });

  test("a role without manageOrg cannot export the company", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(ctxFor(seed.orgA.members.VIEWER.authStatePath));

    expect((await ctx.get("/api/orgs/export")).status()).toBe(403);

    await ctx.dispose();
  });
});

test.describe("workspace deletion", () => {
  test("a non-Owner cannot delete the company", async ({ playwright }) => {
    // An Admin runs the workspace day to day without being able to end it.
    const ctx = await playwright.request.newContext(ctxFor(seed.orgA.members.SITE_SUPERVISOR.authStatePath));

    const res = await ctx.delete("/api/orgs", { data: { confirmName: seed.orgA.name } });

    expect(res.status()).toBe(403);
    // And the org is still there.
    const { data } = await adminClient().from("organizations").select("id").eq("id", seed.orgA.id).maybeSingle();
    expect(data).not.toBeNull();

    await ctx.dispose();
  });

  test("the wrong company name does not delete anything", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(ctxFor(seed.orgA.members.OWNER.authStatePath));

    const res = await ctx.delete("/api/orgs", { data: { confirmName: "Some Other Company" } });

    expect(res.status()).toBe(400);
    const { data } = await adminClient().from("organizations").select("id").eq("id", seed.orgA.id).maybeSingle();
    expect(data).not.toBeNull();

    await ctx.dispose();
  });

  test("an owner can delete their own workspace, and accounts survive", async ({ playwright }) => {
    const admin = adminClient();
    const runId = Date.now();

    // Build a throwaway org — this test destroys what it touches.
    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `E2E Doomed Co ${runId}` })
      .select("*")
      .single();
    createdOrgIds.push(org.id);

    const owner = await createAuthedUser(`e2e-doomed-owner-${runId}@example.com`);
    createdUserIds.push(owner.userId);
    await admin.from("org_members").insert({
      org_id: org.id,
      user_id: owner.userId,
      name: "Doomed Owner",
      email: `e2e-doomed-owner-${runId}@example.com`,
      role: "OWNER",
      active: true,
    });

    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: owner.cookie },
    });

    // Give it something to lose: a project and an uploaded file.
    const project = await ctx.post("/api/projects", { data: { name: "Doomed Project" } });
    expect(project.ok()).toBeTruthy();
    const upload = await ctx.post("/api/uploads", {
      multipart: { file: { name: "d.png", mimeType: "image/png", buffer: Buffer.from([1, 2, 3]) } },
    });
    expect(upload.ok()).toBeTruthy();

    const res = await ctx.delete("/api/orgs", { data: { confirmName: org.name } });
    expect(res.ok()).toBeTruthy();

    // The org and its rows are gone.
    const { data: gone } = await admin.from("organizations").select("id").eq("id", org.id).maybeSingle();
    expect(gone).toBeNull();
    const { data: projects } = await admin.from("projects").select("id").eq("org_id", org.id);
    expect(projects).toEqual([]);

    // Uploaded files are gone too — the database cascade knows nothing about
    // the storage bucket, so this has to be done explicitly.
    const { data: objects } = await admin.storage.from("uploads").list(org.id);
    expect(objects ?? []).toEqual([]);

    // The sign-in account survives: one Owner must not be able to destroy a
    // colleague's login, which may be used elsewhere.
    const { data: user } = await admin.auth.admin.getUserById(owner.userId);
    expect(user.user).not.toBeNull();

    // And the deletion itself is on record. audit_log cascaded away with the
    // organization a moment ago, so this is the only thing left that can say
    // who did it — which is exactly why it has no foreign key.
    const { data: record } = await admin
      .from("deleted_workspaces")
      .select("*")
      .eq("org_id", org.id)
      .maybeSingle();

    expect(record, "the workspace vanished with no record of who deleted it").not.toBeNull();
    expect(record).toMatchObject({
      org_name: org.name,
      deleted_by_user_id: owner.userId,
      deleted_by_email: `e2e-doomed-owner-${runId}@example.com`,
      deleted_by_name: "Doomed Owner",
    });

    // Counts taken before the delete, not after — one member, the project
    // and the file created above. A record saying an empty workspace was
    // destroyed would be a false statement of fact, which is worse than no
    // record at all.
    expect(record!.member_count).toBe(1);
    expect(record!.project_count).toBe(1);
    expect(record!.storage_object_count).toBe(1);
    expect(record!.storage_bytes).toBeGreaterThan(0);

    // Nothing from inside the workspace is retained — no worker names, no
    // report text, no file names. /privacy says counts only, and this is
    // what holds it to that.
    expect(Object.keys(record!).sort()).toEqual(
      [
        "deleted_at",
        "deleted_by_email",
        "deleted_by_name",
        "deleted_by_user_id",
        "id",
        "member_count",
        "org_id",
        "org_name",
        "plan",
        "project_count",
        "report_count",
        "storage_bytes",
        "storage_object_count",
        "worker_count",
      ].sort(),
    );

    // With no membership left the session no longer resolves to a member,
    // so the app treats them as someone who has not set up a company yet.
    expect((await ctx.get("/api/orgs/me")).status()).toBe(401);

    await ctx.dispose();
  });
});
