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
