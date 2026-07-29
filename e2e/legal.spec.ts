import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { AUTH_STATE_PATH, SEED_INFO_PATH, adminClient, createAuthedUser, deleteUsers, type SeedInfo } from "./seed";

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));

/** Created mid-run against the live project, so removed by hand below. */
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

/**
 * The legal documents and the consent record behind them.
 *
 * Two things here can only be proved against a real database: that the
 * consent gate cannot be walked around by calling the API directly, and that
 * an acceptance row obeys the same tenant separation as everything else.
 *
 * No describe-level test.use({ storageState }) — request contexts made with
 * playwright.request.newContext() inherit it, which would quietly sign in the
 * signed-out tests below. Each test states its own identity, as
 * tenant-isolation.spec.ts does.
 */
test.describe("legal documents", () => {
  for (const path of ["/terms", "/privacy"]) {
    test(`${path} is readable with no account at all`, async ({ browser }) => {
      // The privacy notice has to reach someone whose IC number is in a
      // customer's workspace and who has never heard of this product. If the
      // proxy redirects them to a sign-in form, it is not a notice.
      const page = await (await browser.newContext({ storageState: undefined })).newPage();
      const res = await page.goto(path);

      expect(res?.status()).toBe(200);
      expect(page.url(), "redirected to sign-in").toContain(path);
      await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

      await page.close();
    });
  }

  test("the privacy notice names the sensitive columns rather than talking around them", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: undefined })).newPage();
    await page.goto("/privacy");
    const body = (await page.textContent("body")) ?? "";

    for (const term of ["Identity card (IC) number", "CIDB", "Daily rate", "Attendance"]) {
      expect(body, `privacy notice never mentions ${term}`).toContain(term);
    }
    await page.close();
  });

  test("the draft banner is visible while the documents are unreviewed", async ({ browser }) => {
    // If this fails because REVIEWED is now true, that is the good outcome —
    // delete the test rather than reinstating the banner.
    const page = await (await browser.newContext({ storageState: undefined })).newPage();
    await page.goto("/terms");

    await expect(page.getByRole("note")).toContainText(/not yet reviewed by a lawyer/i);
    await page.close();
  });

  test("sign-in links to both documents, so they are findable without a search engine", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: undefined })).newPage();
    await page.goto("/login");

    await expect(page.getByRole("link", { name: /terms of service/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /privacy notice/i })).toBeVisible();
    await page.close();
  });
});

test.describe("consent is recorded, not merely collected", () => {
  test("creating a workspace without accepting is refused by the server", async ({ playwright }) => {
    // The checkbox is client-side and therefore not a control. This is.
    //
    // It has to run as someone with NO workspace. The seeded owner already
    // has one, so POST /api/orgs refuses them with 409 before it ever looks
    // at the body — which would make this test pass without the consent
    // check existing at all.
    const fresh = await createAuthedUser(`e2e-consent-${Date.now()}@example.com`);
    createdUserIds.push(fresh.userId);

    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: fresh.cookie },
    });

    for (const body of [{}, { acceptedTerms: false }]) {
      const res = await ctx.post("/api/orgs", {
        data: { name: `Should Not Exist ${Date.now()}`, ownerName: "Nobody", ...body },
      });
      expect(res.status(), `payload ${JSON.stringify(body)}`).toBe(400);
      expect((await res.json()).error).toMatch(/accept the terms/i);
    }

    // And with consent it goes through, so the refusals above are the
    // consent check and not some unrelated validation failure.
    const ok = await ctx.post("/api/orgs", {
      data: { name: `Consent Test Co ${Date.now()}`, ownerName: "Nobody", acceptedTerms: true },
    });
    expect(ok.status()).toBe(201);
    createdOrgIds.push((await ok.json()).org.id);

    await ctx.dispose();
  });

  test("accepting an invitation without accepting the terms is refused too", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: AUTH_STATE_PATH,
      baseURL: test.info().project.use.baseURL,
    });

    // A bogus token is fine: consent is checked before the token is, so an
    // invalid token must still produce the consent error, not "not found".
    const res = await ctx.post("/api/invites/whatever-token/accept", { data: {} });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/accept the terms/i);

    await ctx.dispose();
  });

  test("the seeded owner has an acceptance row for both documents", async () => {
    // Seeding creates orgs directly, so this asserts what the schema
    // guarantees rather than what the signup flow wrote: the row shape is
    // right and the unique constraint holds.
    const admin = adminClient();
    const { error } = await admin.from("legal_acceptances").insert([
      { org_id: seed.orgA.id, user_id: seed.orgA.members.OWNER.userId, email: "e2e@example.test", document: "terms", version: "e2e-test" },
      { org_id: seed.orgA.id, user_id: seed.orgA.members.OWNER.userId, email: "e2e@example.test", document: "privacy", version: "e2e-test" },
    ]);
    expect(error).toBeNull();

    const { data } = await admin
      .from("legal_acceptances")
      .select("document")
      .eq("org_id", seed.orgA.id)
      .eq("version", "e2e-test");
    expect((data ?? []).map((r) => r.document).sort()).toEqual(["privacy", "terms"]);

    // Same person, same document, same version, twice — the constraint that
    // makes re-running signup safe.
    const { error: dupe } = await admin.from("legal_acceptances").insert({
      org_id: seed.orgA.id,
      user_id: seed.orgA.members.OWNER.userId,
      email: "e2e@example.test",
      document: "terms",
      version: "e2e-test",
    });
    expect(dupe?.code, "duplicate acceptance was allowed").toBe("23505");
  });

  test("a signed-in session from outside the organisation reads none of them", async () => {
    // Written above with the service key, read back through a real user
    // session — which is the path RLS actually governs. There is no API
    // route for acceptances, so this goes straight at PostgREST: every
    // application-level guard is bypassed and only the policy is left.
    const admin = adminClient();
    const email = `legal-rls-${Date.now()}@example.test`;
    const password = `E2eUser!${Date.now()}`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr).toBeNull();

    try {
      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: signInErr } = await anon.auth.signInWithPassword({ email, password });
      expect(signInErr, "could not sign the outsider in, so the read below proves nothing").toBeNull();

      const { data, error } = await anon.from("legal_acceptances").select("*").eq("org_id", seed.orgA.id);

      // Not an error — an empty result. RLS filters rows rather than
      // refusing the query, and a test that accepted an error here would
      // pass just as well if the table had been renamed.
      expect(error).toBeNull();
      expect(data, "an outsider could read org A's acceptances").toEqual([]);
    } finally {
      await admin.auth.admin.deleteUser(created!.user!.id);
    }
  });

  test("the owning tenant can still read its own, so the test above is not a false pass", async () => {
    // The service key ignores RLS, so this reads with it only to confirm the
    // rows exist at all — the point being that the empty result above came
    // from the policy and not from an empty table.
    const { data } = await adminClient()
      .from("legal_acceptances")
      .select("id")
      .eq("org_id", seed.orgA.id)
      .eq("version", "e2e-test");

    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    const admin = adminClient();

    // The hand-written rows from the constraint test.
    await admin.from("legal_acceptances").delete().eq("version", "e2e-test");

    // And the real ones, written by the signup path for the org created
    // above. These need deleting explicitly *because* the table has no
    // foreign key — dropping the organization does not take them with it,
    // which is the whole design and is easy to forget when cleaning up.
    for (const orgId of createdOrgIds) {
      await admin.from("legal_acceptances").delete().eq("org_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }
    await deleteUsers(createdUserIds);
  });
});
