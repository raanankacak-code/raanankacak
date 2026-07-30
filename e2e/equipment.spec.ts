import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { AUTH_STATE_PATH, SEED_INFO_PATH, adminClient, type SeedInfo } from "./seed";

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

test.describe.configure({ mode: "serial" });

let projectId: string;
let equipmentId: string;
let equipmentCode: string;

function ctxFor(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, statePath?: string) {
  return playwright.request.newContext({
    ...(statePath ? { storageState: statePath } : { storageState: undefined }),
    baseURL: test.info().project.use.baseURL,
  });
}

/**
 * The plant register.
 *
 * Two things here can only be proved against a real database: that the
 * equipment_hours view sums the logs rather than trusting a stored total,
 * and that deleting a project releases its machines instead of destroying
 * them — the ON DELETE SET NULL that the migration turns on.
 */
test.describe("equipment", () => {
  test("a machine is registered against a project", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const project = await (
      await ctx.post("/api/projects", { data: { name: `Plant Site ${Date.now()}` } })
    ).json();
    projectId = project.project.id;

    const res = await ctx.post("/api/equipment", {
      data: {
        name: "Excavator 20T",
        type: "Excavator",
        registrationNo: "QAB 1234",
        projectId,
        owned: true,
        nextServiceDate: "2030-01-01",
        inspectionExpiry: "2030-06-30",
      },
    });

    expect(res.status()).toBe(201);
    const { equipment } = await res.json();
    equipmentId = equipment.id;
    equipmentCode = equipment.code;

    expect(equipment.code).toMatch(/^EQ-\d{3}$/);
    expect(equipment.status).toBe("ACTIVE");
    expect(equipment.projectId).toBe(projectId);

    await ctx.dispose();
  });

  test("the reference is the server's to allocate", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const res = await ctx.post("/api/equipment", {
      data: { name: "Tower Crane", owned: false, supplier: "Sarawak Plant Hire", code: "EQ-999" },
    });

    expect(res.status()).toBe(201);
    // Two machines sharing a reference is how a service record ends up
    // against the wrong machine.
    expect((await res.json()).equipment.code).not.toBe("EQ-999");

    await ctx.dispose();
  });

  test("hours are summed from the logs, not from a stored total", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    for (const hours of [8, 6.5, 4]) {
      const res = await ctx.post(`/api/equipment/${equipmentId}/usage`, {
        data: { date: "2026-07-20", hours, operatorName: "Azlan" },
      });
      expect(res.status()).toBe(201);
    }

    const { hours } = await (await ctx.get(`/api/equipment/${equipmentId}`)).json();
    expect(hours.totalHours).toBe(18.5);
    expect(hours.logCount).toBe(3);

    await ctx.dispose();
  });

  test("an impossible day is refused", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    // Capped in the schema and by a CHECK constraint. 25 hours in a day is a
    // typo, and a typo in an invoiced figure is expensive.
    const res = await ctx.post(`/api/equipment/${equipmentId}/usage`, {
      data: { date: "2026-07-21", hours: 25 },
    });

    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("a Site Supervisor can log hours but cannot register a machine", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, seed.orgA.members.SITE_SUPERVISOR.authStatePath);

    const logged = await ctx.post(`/api/equipment/${equipmentId}/usage`, {
      data: { date: "2026-07-22", hours: 5 },
    });
    expect(logged.status(), "a supervisor must be able to log what a machine did").toBe(201);

    const registered = await ctx.post("/api/equipment", { data: { name: "Unauthorised Dumper", owned: true } });
    expect(registered.status()).toBe(403);

    await ctx.dispose();
  });

  test("a Viewer can do neither", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, seed.orgA.members.VIEWER.authStatePath);

    expect((await ctx.post("/api/equipment", { data: { name: "Nope", owned: true } })).status()).toBe(403);
    expect(
      (await ctx.post(`/api/equipment/${equipmentId}/usage`, { data: { date: "2026-07-23", hours: 1 } })).status(),
    ).toBe(403);

    await ctx.dispose();
  });

  test("a retired machine stops accepting hours", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const retired = await ctx.post("/api/equipment", { data: { name: "Old Roller", owned: true } });
    const { equipment } = await retired.json();
    await ctx.patch(`/api/equipment/${equipment.id}`, { data: { status: "RETIRED" } });

    const res = await ctx.post(`/api/equipment/${equipment.id}/usage`, { data: { date: "2026-07-24", hours: 3 } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/retired/i);

    await ctx.dispose();
  });

  test("another tenant cannot read or touch it", async ({ playwright }) => {
    const ctx = await ctxFor(playwright, seed.orgB.owner.authStatePath);

    expect((await ctx.get(`/api/equipment/${equipmentId}`)).status()).toBe(404);
    expect((await ctx.patch(`/api/equipment/${equipmentId}`, { data: { name: "Renamed" } })).status()).toBe(404);
    expect((await ctx.delete(`/api/equipment/${equipmentId}`)).status()).toBe(404);
    expect(
      (await ctx.post(`/api/equipment/${equipmentId}/usage`, { data: { date: "2026-07-25", hours: 2 } })).status(),
    ).toBe(404);

    const list = await (await ctx.get("/api/equipment")).json();
    expect((list.equipment ?? []).map((e: { code: string }) => e.code)).not.toContain(equipmentCode);

    await ctx.dispose();
  });

  test("the equipment_hours view is subject to the same tenant separation", async () => {
    // security_invoker=on is the whole reason the view is safe. Without it
    // the view would run as its owner and hand every workspace's hours to
    // anybody who queried it.
    const admin = adminClient();
    const { data } = await admin.from("equipment_hours").select("equipment_id").eq("equipment_id", equipmentId);
    expect(data?.length, "the service role should see the row the view is built from").toBe(1);

    const anon = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/equipment_hours?equipment_id=eq.${equipmentId}`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
    );
    // Anonymous, so auth_org_id() matches nothing and the view yields
    // nothing — an empty result rather than an error, which is how RLS
    // filters rather than refuses.
    expect(await anon.json()).toEqual([]);
  });

  test("a signed-out visitor gets nothing", async ({ playwright }) => {
    const ctx = await ctxFor(playwright);

    expect((await ctx.get("/api/equipment")).status()).toBe(401);
    expect((await ctx.get(`/api/equipment/${equipmentId}`)).status()).toBe(401);

    await ctx.dispose();
  });

  test("deleting a project releases its machines rather than destroying them", async ({ playwright }) => {
    // ON DELETE SET NULL, not CASCADE. A machine outlives the job it was on,
    // and losing the plant register because a finished project was tidied
    // away would be a very expensive surprise.
    const ctx = await ctxFor(playwright, AUTH_STATE_PATH);

    const deleted = await ctx.delete(`/api/projects/${projectId}`);
    expect(deleted.ok(), "could not delete the project, so this proves nothing").toBeTruthy();

    const res = await ctx.get(`/api/equipment/${equipmentId}`);
    expect(res.status()).toBe(200);
    const { equipment, hours } = await res.json();
    expect(equipment.projectId, "the machine went with the project").toBeNull();
    // And its history survived too.
    expect(hours.totalHours).toBeGreaterThan(0);

    await ctx.dispose();
  });
});

/** Its own describe so the storageState is not inherited by the contexts above. */
test.describe("the equipment page", () => {
  test.use({ storageState: AUTH_STATE_PATH });

  test("renders the register", async ({ page }) => {
    await page.goto("/equipment");
    await expect(page.getByRole("heading", { name: /equipment/i }).first()).toBeVisible();
    await expect(page.getByText(equipmentCode)).toBeVisible();
    await expect(page.getByText("Excavator 20T")).toBeVisible();
    // Released back to the yard by the project deletion above.
    await expect(page.getByText("In the yard").first()).toBeVisible();
  });

  test("the dashboard shows the plant position", async ({ page }) => {
    // The dashboard replaces every KPI with an onboarding empty state when a
    // workspace has no projects, and the test above deletes the one this
    // spec created. Make one rather than depending on what ran before.
    const created = await page.request.post("/api/projects", {
      data: { name: `Dashboard Site ${Date.now()}` },
    });
    expect(created.ok(), "could not create a project, so the dashboard stays empty").toBeTruthy();

    await page.goto("/dashboard");
    await expect(page.locator(".kpi", { hasText: "Plant Due" })).toBeVisible();
  });
});
