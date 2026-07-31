import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, adminClient, createAuthedUser, deleteUsers, type SeedInfo } from "./seed";

/**
 * Client sign-off.
 *
 * A record someone may lean on months later, so the tests are about what
 * cannot happen to it: a decision cannot be re-made, a rejection cannot be
 * withdrawn out of existence, the name on the signature comes from the
 * signed-in account rather than the request, and staff cannot sign on the
 * client's behalf. Several of those are enforced twice — once in the route
 * and once by a CHECK constraint — and the last describe here goes straight
 * at the database to prove the second half.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));
const createdUserIds: string[] = [];

test.describe.configure({ mode: "serial" });

let projectId: string;
let clientCookie: string;
let clientEmail: string;
let clientMemberId: string;
let approvalId: string;
let approvalCode: string;
/** org_members ids, which the seed file does not carry — only auth user ids. */
let ownerMemberId: string;
let viewerMemberId: string;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data, error } = await admin
    .from("org_members")
    .select("id, email")
    .eq("org_id", seed.orgA.id)
    .in("email", [seed.orgA.members.OWNER.email, seed.orgA.members.VIEWER.email]);
  if (error) throw error;
  ownerMemberId = (data ?? []).find((m) => m.email === seed.orgA.members.OWNER.email)!.id as string;
  viewerMemberId = (data ?? []).find((m) => m.email === seed.orgA.members.VIEWER.email)!.id as string;
});

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

test.afterAll(async () => {
  await deleteUsers(createdUserIds);
  if (projectId) await adminClient().from("projects").delete().eq("id", projectId);
});

test.describe("setting one up", () => {
  test("a project with a client on it", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);

    const project = await (
      await ctx.post("/api/projects", { data: { name: `Sign-off Site ${Date.now()}` } })
    ).json();
    projectId = project.project.id;

    clientEmail = `e2e-signoff-${Date.now()}@example.com`;
    const invite = await (
      await ctx.post("/api/team/invites", {
        data: { name: "Sarawak Energy", email: clientEmail, role: "CLIENT", projectIds: [projectId] },
      })
    ).json();

    const account = await createAuthedUser(clientEmail);
    createdUserIds.push(account.userId);
    clientCookie = account.cookie;

    const accepting = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: clientCookie },
    });
    expect(
      (await accepting.post(`/api/invites/${encodeURIComponent(invite.invite.token)}/accept`, { data: { acceptedTerms: true } })).ok(),
    ).toBeTruthy();
    await accepting.dispose();

    const { data } = await adminClient().from("org_members").select("id").eq("email", clientEmail).single();
    clientMemberId = data!.id as string;

    await ctx.dispose();
  });

  test("a request with no client on the project is refused at the point of asking", async ({ playwright }) => {
    // Otherwise it sits pending for ever and the site team assumes the
    // client is ignoring them.
    const ctx = await ownerCtx(playwright);
    const lonely = await (await ctx.post("/api/projects", { data: { name: `No Client ${Date.now()}` } })).json();

    const res = await ctx.post("/api/approvals", {
      data: { projectId: lonely.project.id, title: "Substructure complete" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/no client has access/i);

    await ctx.delete(`/api/projects/${lonely.project.id}`);
    await ctx.dispose();
  });
});

test.describe("raising one", () => {
  test("the contractor sends something for sign-off", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);

    const res = await ctx.post("/api/approvals", {
      data: {
        projectId,
        title: "Substructure complete — Block A",
        description: "Pile caps, ground beams and blinding all poured and cured.",
      },
    });

    expect(res.status()).toBe(201);
    const { approval } = await res.json();
    approvalId = approval.id;
    approvalCode = approval.code;

    expect(approval.code).toMatch(/^AP-\d{3}$/);
    expect(approval.status).toBe("PENDING");
    // Nothing is signed until the client signs it.
    expect(approval.decidedByName).toBeNull();
    expect(approval.decidedAt).toBeNull();

    await ctx.dispose();
  });

  test("the caller cannot file one already approved", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post("/api/approvals", {
      data: {
        projectId,
        title: "Already signed, honest",
        status: "APPROVED",
        decidedByName: "Sarawak Energy",
        decidedAt: "2026-01-01T00:00:00Z",
        code: "AP-999",
      },
    });

    expect(res.status()).toBe(201);
    const { approval } = await res.json();
    // Everything the caller tried to dictate is the server's to decide.
    expect(approval.status).toBe("PENDING");
    expect(approval.decidedByName).toBeNull();
    expect(approval.code).not.toBe("AP-999");

    // Tidy up so the counts below stay readable.
    await ctx.post(`/api/approvals/${approval.id}`);
    await ctx.dispose();
  });

  test("a Site Supervisor cannot ask the client to sign anything", async ({ playwright }) => {
    // Running the project is what this is, so it sits with the roles that
    // run projects.
    const ctx = await playwright.request.newContext({
      storageState: seed.orgA.members.SITE_SUPERVISOR.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });
    expect((await ctx.post("/api/approvals", { data: { projectId, title: "Sneaky" } })).status()).toBe(403);
    await ctx.dispose();
  });
});

test.describe("the client answers", () => {
  test("a rejection must say why", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);
    const res = await ctx.post(`/api/portal/approvals/${approvalId}`, { data: { decision: "REJECTED" } });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/what is wrong/i);
    await ctx.dispose();
  });

  test("staff cannot sign on the client's behalf", async ({ playwright }) => {
    // The whole value of the record is that the contractor cannot produce it
    // themselves.
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post(`/api/portal/approvals/${approvalId}`, { data: { decision: "APPROVED" } });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("another workspace's client cannot answer it either", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: seed.orgB.owner.authStatePath,
      baseURL: test.info().project.use.baseURL,
    });
    // 403 for being staff rather than a client; the point is that it is not 200.
    expect((await ctx.post(`/api/portal/approvals/${approvalId}`, { data: { decision: "APPROVED" } })).status()).not.toBe(200);
    await ctx.dispose();
  });

  test("the client approves, and the signature is theirs", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);
    const res = await ctx.post(`/api/portal/approvals/${approvalId}`, {
      data: {
        decision: "APPROVED",
        comment: "Happy with this.",
        // Sent deliberately: the name on a signature must come from the
        // signed-in account, never from the request body.
        decidedByName: "Somebody Else",
        decidedByEmail: "somebody@else.example",
      },
    });

    expect(res.ok()).toBeTruthy();
    const { approval } = await res.json();
    expect(approval.status).toBe("APPROVED");
    expect(approval.decidedByName).toBe("Sarawak Energy");
    expect(approval.decidedByEmail).toBe(clientEmail);
    expect(approval.decidedAt).toBeTruthy();
    expect(approval.decisionComment).toBe("Happy with this.");

    await ctx.dispose();
  });

  test("and cannot un-answer it", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);
    const res = await ctx.post(`/api/portal/approvals/${approvalId}`, {
      data: { decision: "REJECTED", comment: "Changed my mind." },
    });

    expect(res.status()).toBe(409);
    // The record is unchanged.
    const { data } = await adminClient().from("project_approvals").select("status").eq("id", approvalId).single();
    expect(data!.status).toBe("APPROVED");

    await ctx.dispose();
  });

  test("the contractor cannot withdraw something already signed", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post(`/api/approvals/${approvalId}`);
    expect(res.status()).toBe(409);
    await ctx.dispose();
  });

  test("a rejection stays on the record, and the fix is a fresh request", async ({ playwright }) => {
    const owner = await ownerCtx(playwright);
    const client = await clientCtx(playwright);

    const raised = await (
      await owner.post("/api/approvals", { data: { projectId, title: "Lobby tiling complete" } })
    ).json();

    const rejected = await client.post(`/api/portal/approvals/${raised.approval.id}`, {
      data: { decision: "REJECTED", comment: "Tiling is not the specified finish." },
    });
    expect(rejected.ok()).toBeTruthy();
    expect((await rejected.json()).approval.decisionComment).toMatch(/not the specified finish/);

    // Rejected is final: no route puts it back to pending, and withdrawing
    // it — which would make the rejection disappear — is refused.
    expect((await owner.post(`/api/approvals/${raised.approval.id}`)).status()).toBe(409);
    expect(
      (await client.post(`/api/portal/approvals/${raised.approval.id}`, { data: { decision: "APPROVED" } })).status(),
    ).toBe(409);

    // The way forward is a new request, so the history shows both events.
    const again = await owner.post("/api/approvals", { data: { projectId, title: "Lobby tiling complete (re-laid)" } });
    expect(again.status()).toBe(201);

    await owner.dispose();
    await client.dispose();
  });
});

test.describe("the record, and who can see it", () => {
  test("the client sees their own sign-offs in the portal", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);
    const res = await ctx.get(`/portal/${projectId}`);
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("Substructure complete");
    expect(html).toContain(approvalCode);
    await ctx.dispose();
  });

  test("another tenant sees none of it, asked directly of the database", async () => {
    const anon = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/project_approvals?select=id&project_id=eq.${projectId}`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
    );
    expect(await anon.json()).toEqual([]);
  });

  test("the audit trail names the client, not the app", async () => {
    const { data } = await adminClient()
      .from("audit_log")
      .select("action, summary, actor_name")
      .eq("org_id", seed.orgA.id)
      .eq("action", "APPROVAL_DECIDED")
      .order("created_at", { ascending: false })
      .limit(5);

    const mine = (data ?? []).find((row) => (row.summary as string).includes("Substructure complete"));
    expect(mine, "no audit entry for the client's decision").toBeTruthy();
    expect(mine!.actor_name).toBe("Sarawak Energy");
  });

  test("revoking access does not rewrite what was signed", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);

    const before = await (await ctx.get(`/api/projects/${projectId}/client-access`)).json();
    expect(before.clients).toHaveLength(1);

    const revoked = await ctx.delete(`/api/projects/${projectId}/client-access`, {
      data: { memberId: clientMemberId },
    });
    expect(revoked.ok()).toBeTruthy();
    expect((await revoked.json()).clients).toHaveLength(0);

    // The signature stands, with the name and email as they were.
    const { data } = await adminClient()
      .from("project_approvals")
      .select("status, decided_by_name, decided_by_email")
      .eq("id", approvalId)
      .single();
    expect(data!.status).toBe("APPROVED");
    expect(data!.decided_by_name).toBe("Sarawak Energy");
    expect(data!.decided_by_email).toBe(clientEmail);

    await ctx.dispose();
  });

  test("but the client can no longer see the project at all", async ({ playwright }) => {
    const ctx = await clientCtx(playwright);
    expect((await ctx.get(`/portal/${projectId}`)).status()).toBe(404);
    await ctx.dispose();
  });

  test("access can be given back, and it is one row rather than two", async ({ playwright }) => {
    const ctx = await ownerCtx(playwright);

    await ctx.post(`/api/projects/${projectId}/client-access`, { data: { memberId: clientMemberId } });
    // Granting twice is the operation callers actually want — "make sure they
    // can see this" — so it must not fail on the unique constraint.
    const second = await ctx.post(`/api/projects/${projectId}/client-access`, { data: { memberId: clientMemberId } });
    expect(second.status()).toBe(201);
    expect((await second.json()).clients).toHaveLength(1);

    await ctx.dispose();
  });

  test("a member of staff cannot be given project-by-project access", async ({ playwright }) => {
    // Staff are scoped by company. A row here would imply a restriction that
    // nothing enforces.
    const ctx = await ownerCtx(playwright);
    const res = await ctx.post(`/api/projects/${projectId}/client-access`, {
      data: { memberId: viewerMemberId },
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });
});

test.describe("what the database refuses regardless of the app", () => {
  // The routes above enforce these too. These check the second lock: a
  // future route, a script, or a mistake in this repo cannot write a
  // signature that never happened.

  test("a decided row without a name or a time is impossible", async () => {
    const admin = adminClient();
    const { error } = await admin
      .from("project_approvals")
      .update({ status: "APPROVED", decided_by_name: null, decided_at: null })
      .eq("id", approvalId);
    expect(error?.message, "the database accepted an approval nobody signed").toMatch(/approval_decision_complete/);
  });

  test("a rejection with no reason is impossible", async () => {
    const admin = adminClient();
    const { data: raised } = await admin
      .from("project_approvals")
      .insert({
        org_id: seed.orgA.id,
        project_id: projectId,
        code: `AP-DB-${Date.now()}`,
        title: "Direct insert",
        requested_by_id: ownerMemberId,
        requested_by_name: "E2E Owner",
      })
      .select("id")
      .single();

    const { error } = await admin
      .from("project_approvals")
      .update({
        status: "REJECTED",
        decided_by_name: "Someone",
        decided_at: new Date().toISOString(),
        decision_comment: "   ",
      })
      .eq("id", raised!.id);
    expect(error?.message, "the database accepted a rejection with no reason").toMatch(/approval_rejection_has_reason/);

    await admin.from("project_approvals").delete().eq("id", raised!.id);
  });
});
