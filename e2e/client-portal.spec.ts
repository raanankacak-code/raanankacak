import { test, expect, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, adminClient, createAuthedUser, deleteUsers, type SeedInfo } from "./seed";

/**
 * The client's own login.
 *
 * A client is inside the contractor's workspace — same org, same tables — and
 * is allowed to see one project of it. That makes this the one role where
 * "filtered by org" is not enough, so every claim below is checked twice:
 * once through the app, and once by querying PostgREST directly with the
 * client's own JWT. The second half is the one that matters. If the route
 * handler and the policy ever disagree, the app can be talked round and the
 * database cannot.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));
const createdUserIds: string[] = [];

test.describe.configure({ mode: "serial" });

let sharedProjectId: string;
let privateProjectId: string;
let clientCookie: string;
let clientToken: string;
let clientEmail: string;
let sharedPhotoUrl: string;
let privatePhotoUrl: string;

function ownerCtx(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }) {
  return playwright.request.newContext({
    storageState: seed.orgA.members.OWNER.authStatePath,
    baseURL: test.info().project.use.baseURL,
  });
}

function clientCtx(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }) {
  return playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { cookie: clientCookie },
  });
}

/** Straight to PostgREST with the client's JWT — no route handler in between. */
async function asClient(path: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${clientToken}`,
    },
  });
  return (await res.json()) as unknown[];
}

test.afterAll(async () => {
  await deleteUsers(createdUserIds);
  const admin = adminClient();
  // Deleting the project takes its reports, snags, inspections, workers,
  // requests and documents with it. Plant and calendar entries are ON DELETE
  // SET NULL — they outlive the job — so they have to go by hand, or the next
  // spec finds a machine it did not create sitting in the register.
  await admin.from("equipment").delete().eq("name", "Client Portal Excavator").eq("org_id", seed.orgA.id);
  await admin.from("calendar_events").delete().eq("title", "Internal progress meeting").eq("org_id", seed.orgA.id);
  for (const id of [sharedProjectId, privateProjectId].filter(Boolean)) {
    await admin.from("projects").delete().eq("id", id);
  }
});

test.describe("inviting a client", () => {
  test("two projects, one of which the client will never be told about", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);

    const shared = await ctx.post("/api/projects", {
      data: { name: `Client Visible ${Date.now()}`, client: "Sarawak Energy", siteAddress: "Jalan Bako, Kuching" },
    });
    sharedProjectId = (await shared.json()).project.id;

    const hidden = await ctx.post("/api/projects", { data: { name: `Client Invisible ${Date.now()}` } });
    privateProjectId = (await hidden.json()).project.id;

    // A report with a photo on each, so the file check later has something
    // real to allow and something real to refuse.
    for (const [projectId, target] of [
      [sharedProjectId, "shared"],
      [privateProjectId, "private"],
    ] as const) {
      const upload = await ctx.post("/api/uploads", {
        multipart: {
          file: { name: `${target}.png`, mimeType: "image/png", buffer: onePixelPng() },
        },
      });
      expect(upload.ok(), "could not upload a photo, so the file test proves nothing").toBeTruthy();
      const url = (await upload.json()).url as string;
      if (target === "shared") sharedPhotoUrl = url;
      else privatePhotoUrl = url;

      const report = await ctx.post("/api/reports", {
        data: { projectId, date: "2026-07-30", weather: "Fine", workCompleted: "Piling to grid C", photos: [url] },
      });
      expect(report.status()).toBe(201);

      // A snag and an inspection on each project as well, so "the client sees
      // only their own" is a comparison between two populated projects rather
      // than between one and nothing.
      expect(
        (
          await ctx.post("/api/defects", {
            data: { projectId, title: `Cracked slab (${target})`, severity: "HIGH", location: "Block A" },
          })
        ).status(),
      ).toBe(201);
      expect(
        (
          await ctx.post("/api/safety", {
            data: {
              projectId,
              date: "2026-07-30",
              items: [{ category: "Access", item: "Handrails in place", result: "PASS" }],
            },
          })
        ).status(),
      ).toBe(201);
    }

    await ctx.dispose();
  });

  test("and a row in every staff-only table, so hiding them means something", async ({ playwright }) => {
    // Without this the checks further down would pass against empty tables
    // and prove nothing at all. Each row goes on the project the client CAN
    // see — the hardest case, since the org filter and the project filter
    // both say yes and only the staff-only rule says no.
    const ctx = await ownerCtx(playwright);

    const worker = await ctx.post(`/api/projects/${sharedProjectId}/workers`, {
      data: { name: "Azlan bin Osman", trade: "Concretor", icNumber: "880101-13-5555" },
    });
    expect(worker.status()).toBe(201);
    const workerId = (await worker.json()).worker.id;

    expect(
      (
        await ctx.put("/api/attendance", {
          data: {
            projectId: sharedProjectId,
            date: "2026-07-30",
            records: [{ workerId, status: "PRESENT", timeIn: "08:00", timeOut: "17:00" }],
          },
        })
      ).ok(),
    ).toBeTruthy();

    expect(
      (
        await ctx.post("/api/materials", {
          data: { projectId: sharedProjectId, material: "OPC cement", qty: 40, unit: "bags", status: "SUBMITTED" },
        })
      ).status(),
    ).toBe(201);

    expect(
      (
        await ctx.post("/api/equipment", {
          // Named for this spec: deleting a project releases its machines
          // rather than destroying them, so anything generic left here turns
          // up in another spec's register.
          data: { name: "Client Portal Excavator", owned: true, projectId: sharedProjectId },
        })
      ).status(),
    ).toBe(201);

    expect(
      (
        await ctx.post("/api/calendar", {
          data: { projectId: sharedProjectId, type: "MEETING", title: "Internal progress meeting", date: "2026-08-04" },
        })
      ).status(),
    ).toBe(201);

    const upload = await ctx.post("/api/uploads", {
      multipart: { file: { name: "contract.png", mimeType: "image/png", buffer: onePixelPng() } },
    });
    const docUrl = (await upload.json()).url as string;
    expect(
      (
        await ctx.post(`/api/projects/${sharedProjectId}/documents`, {
          data: { folder: "Contract", name: "Signed contract", url: docUrl, sizeBytes: 68, mimeType: "image/png" },
        })
      ).status(),
    ).toBe(201);

    await ctx.dispose();
  });

  test("a client invitation must name at least one project", async ({ playwright }) => {
    // Otherwise it creates a login that can see nothing at all, and the
    // person on the other end concludes the app is broken.
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post("/api/team/invites", {
      data: { name: "No Projects", email: `e2e-client-none-${Date.now()}@example.com`, role: "CLIENT" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/at least one project/i);
    await ctx.dispose();
  });

  test("a project belonging to another workspace is refused", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);
    const other = await playwright.request.newContext({
      storageState: seed.orgB.owner.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });
    const theirs = await other.post("/api/projects", { data: { name: `Org B Site ${Date.now()}` } });
    const theirProjectId = (await theirs.json()).project.id;

    const res = await ctx.post("/api/team/invites", {
      data: {
        name: "Cross Tenant",
        email: `e2e-client-x-${Date.now()}@example.com`,
        role: "CLIENT",
        projectIds: [theirProjectId],
      },
    });

    expect(res.status()).toBe(400);
    await other.delete(`/api/projects/${theirProjectId}`);
    await other.dispose();
    await ctx.dispose();
  });

  test("a staff invitation cannot be limited to projects, because nothing would enforce it", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post("/api/team/invites", {
      data: {
        name: "Scoped Engineer",
        email: `e2e-scoped-${Date.now()}@example.com`,
        role: "ENGINEER",
        projectIds: [sharedProjectId],
      },
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("the client accepts, and the access comes from the invitation rather than the request", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);
    clientEmail = `e2e-client-${Date.now()}@example.com`;

    const invited = await ctx.post("/api/team/invites", {
      data: { name: "Sarawak Energy", email: clientEmail, role: "CLIENT", projectIds: [sharedProjectId] },
    });
    expect(invited.status()).toBe(201);
    const token = (await invited.json()).invite.token;
    await ctx.dispose();

    const account = await createAuthedUser(clientEmail);
    createdUserIds.push(account.userId);
    clientCookie = account.cookie;
    clientToken = account.accessToken;

    const accepting = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: clientCookie },
    });
    // The private project is sent along deliberately: acceptance must ignore
    // anything the person signing up says about their own access.
    const res = await accepting.post(`/api/invites/${encodeURIComponent(token)}/accept`, {
      data: { acceptedTerms: true, projectIds: [sharedProjectId, privateProjectId] },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).member.role).toBe("CLIENT");
    await accepting.dispose();

    const { data } = await adminClient()
      .from("project_access")
      .select("project_id, org_members!inner(email)")
      .eq("org_members.email", clientEmail);
    expect(data?.map((r) => r.project_id)).toEqual([sharedProjectId]);
  });

  test("and something waiting for their signature, so the portal scan sees it", async ({ playwright }) => {
    // After the acceptance above, not before it: a sign-off request is
    // refused on a project no client can see, which is the point of that
    // rule and was the reason this test failed when it ran first.
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post("/api/approvals", {
      data: { projectId: sharedProjectId, title: "Substructure complete", description: "Ready for your sign-off." },
    });
    expect(res.status()).toBe(201);
    await ctx.dispose();
  });
});

test.describe("what the database will hand a client", () => {
  // Every assertion here is PostgREST answering the client's own JWT. No
  // application code is involved, so these are the row-level security
  // policies themselves passing or failing.

  test("projects: theirs, and only theirs", async () => {
    const rows = (await asClient("projects?select=id,name")) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([sharedProjectId]);
  });

  test("the site diary and the snag list follow the same scope", async () => {
    const reports = (await asClient("daily_reports?select=id,project_id")) as { project_id: string }[];
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.project_id === sharedProjectId)).toBe(true);

    // Both projects have one of each, so a length of exactly one is the
    // policy choosing — `every()` over an empty list would not be.
    const defects = (await asClient("defects?select=id,project_id")) as { project_id: string }[];
    expect(defects).toHaveLength(1);
    expect(defects[0].project_id).toBe(sharedProjectId);

    const inspections = (await asClient("safety_inspections?select=id,project_id")) as { project_id: string }[];
    expect(inspections).toHaveLength(1);
    expect(inspections[0].project_id).toBe(sharedProjectId);

    expect(reports).toHaveLength(1);
  });

  const STAFF_ONLY: [string, string][] = [
    ["workers", "the labourers on site, with their IC numbers"],
    ["attendance_records", "who turned up, which is personal data"],
    ["material_requests", "what things cost"],
    ["equipment", "the plant register"],
    ["documents", "one bucket per project, with no internal/shared split"],
    ["calendar_events", "the contractor's internal diary"],
    ["audit_log", "who did what inside the company"],
    ["org_invites", "invitation tokens"],
    ["org_subscriptions", "the contractor's billing"],
    ["notifications", "internal notices"],
  ];

  for (const [table, why] of STAFF_ONLY) {
    test(`${table} is invisible — ${why}`, async () => {
      // First: there is something to hide. An empty result from an empty
      // table is not a policy working, and that is exactly the kind of test
      // that keeps passing after the policy is deleted.
      const { count } = await adminClient()
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("org_id", seed.orgA.id);
      expect(count ?? 0, `${table} has no rows in this workspace, so an empty answer proves nothing`).toBeGreaterThan(0);

      const rows = await asClient(`${table}?select=id`);
      expect(Array.isArray(rows) ? rows : []).toEqual([]);
    });
  }

  test("the staff list is invisible apart from their own row", async () => {
    const rows = (await asClient("org_members?select=id,email")) as { email: string }[];
    expect(rows.map((r) => r.email)).toEqual([clientEmail]);
  });

  test("the contractor's own details stay visible, because the portal shows them", async () => {
    const rows = (await asClient("organizations?select=id,name")) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([seed.orgA.id]);
  });
});

test.describe("what the app will hand a client", () => {
  const INTERNAL_ROUTES = [
    "/api/projects",
    "/api/reports",
    "/api/materials",
    "/api/equipment",
    "/api/safety",
    "/api/defects",
    "/api/team",
    "/api/team/invites",
    "/api/attendance",
    "/api/audit-log",
    "/api/calendar",
    "/api/notifications",
    // Global search would be the neatest way round a per-project boundary:
    // one query, every module, no project filter in sight.
    "/api/search?q=a",
    "/api/orgs/me",
    "/api/attendance/monthly?month=2026-07",
    `/api/projects/PROJECT_ID`,
    `/api/projects/PROJECT_ID/documents`,
  ];

  for (const path of INTERNAL_ROUTES) {
    test(`${path} is refused`, async ({ playwright }) => {
      const ctx = await clientCtx(playwright);
      // The project routes are asked about the project the client CAN see —
      // the hardest case, and the one where "they have access, so let them
      // in" would be a plausible mistake.
      const res = await ctx.get(path.replace("PROJECT_ID", sharedProjectId));
      // 403 rather than an empty list: a client is not a staff account with
      // nothing in it, and a route that answered 200 would be one refactor
      // away from answering with rows.
      expect(res.status(), `${path} answered ${res.status()}`).toBe(403);
      await ctx.dispose();
    });
  }

  test("but can change their own name, because it goes on a sign-off", async ({ playwright }) => {
    // The one thing about themselves a client owns. Deliberately opened in
    // milestone 27 — before that this route refused them like every other,
    // and this test asserted the 403.
    const ctx = await clientCtx(playwright);
    const res = await ctx.patch("/api/profile", { data: { name: "Sarawak Energy Bhd" } });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).member.name).toBe("Sarawak Energy Bhd");

    // And nothing else about themselves: role and active state are not
    // fields this route accepts, so sending them changes nothing.
    const escalate = await ctx.patch("/api/profile", { data: { name: "Sarawak Energy", role: "OWNER", active: true } });
    expect(escalate.ok()).toBeTruthy();
    expect((await escalate.json()).member.role).toBe("CLIENT");

    await ctx.dispose();
  });

  test("and cannot write anything either", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);
    expect((await ctx.post("/api/projects", { data: { name: "Mine now" } })).status()).toBe(403);
    expect(
      (await ctx.post("/api/defects", { data: { projectId: sharedProjectId, title: "Fix this", severity: "HIGH" } })).status(),
    ).toBe(403);
    expect(
      (await ctx.post("/api/reports", { data: { projectId: sharedProjectId, date: "2026-07-31" } })).status(),
    ).toBe(403);
    await ctx.dispose();
  });

  test("a photo on their project is readable; one on another project is not", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);

    const mine = await ctx.get(sharedPhotoUrl);
    expect(mine.status(), "a client cannot see the photographs in their own site diary").toBe(200);

    // Same workspace, same bucket, one path segment apart — the org check
    // that protects staff would have handed this over.
    const theirs = await ctx.get(privatePhotoUrl);
    expect(theirs.status(), "a client could read another project's photograph").toBe(404);

    await ctx.dispose();
  });
});

test.describe("the portal", () => {
  test("shows their project and not the other one", async ({ browser }) => {
    const page = await newClientPage(browser);
    await page.goto("/portal");

    await expect(page.getByRole("heading", { name: /your projects/i })).toBeVisible();
    await expect(page.getByText("Client Visible", { exact: false })).toBeVisible();
    await expect(page.getByText("Client Invisible", { exact: false })).toHaveCount(0);

    await page.close();
  });

  test("opens the project: progress, the diary, the snag list, the safety record", async ({ browser }) => {
    const page = await newClientPage(browser);
    await page.goto(`/portal/${sharedProjectId}`);

    await expect(page.getByRole("heading", { name: /site diary/i })).toBeVisible();
    await expect(page.getByText("Piling to grid C")).toBeVisible();
    await expect(page.getByRole("heading", { name: /snag list/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /safety record/i })).toBeVisible();

    await page.close();
  });

  test("another project's page is a 404, not an empty one", async ({ browser }) => {
    const page = await newClientPage(browser);
    const res = await page.goto(`/portal/${privateProjectId}`);
    expect(res?.status()).toBe(404);
    await page.close();
  });

  test("the staff app sends them back to the portal", async ({ browser }) => {
    const page = await newClientPage(browser);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/portal$/);
    await page.close();
  });

  test("a member of staff sent to the portal is sent back to the dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: seed.orgA.members.OWNER.authStatePath });
    const page = await context.newPage();
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  // The portal is a new set of pages with its own layout, and the scan in
  // accessibility.spec.ts cannot reach it: that suite signs in as the Owner,
  // who is redirected away from here. Same bar as every other page — WCAG A
  // and AA, best-practice rules excluded.
  for (const [name, path] of [
    ["the project list", "/portal"],
    ["a project", "PROJECT"],
  ] as const) {
    test(`${name} has no WCAG A/AA violations`, async ({ browser }) => {
      const page = await newClientPage(browser);
      await page.goto(path === "PROJECT" ? `/portal/${sharedProjectId}` : path);
      await page.locator("h2").first().waitFor();

      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(
        violations.length,
        `\n  ${violations.map((v) => `${v.id} (${v.impact}) — ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`).join("\n  ")}`,
      ).toBe(0);
      await page.close();
    });
  }

  test("a signed-out visitor gets the sign-in page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});

/** A browser signed in as the client, cookie jar and all. */
async function newClientPage(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({ storageState: undefined });
  await context.addCookies(
    clientCookie.split("; ").map((pair) => {
      const eq = pair.indexOf("=");
      return {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        domain: "localhost",
        path: "/",
      };
    }),
  );
  return context.newPage();
}

/** The smallest valid PNG, so the upload is a real image without a fixture file. */
function onePixelPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}
