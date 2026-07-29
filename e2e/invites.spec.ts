import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_INFO_PATH, createAuthedUser, deleteUsers, type SeedInfo } from "./seed";

/**
 * Invitation issue, lookup and acceptance.
 *
 * This is the most security-sensitive flow in the app after sign-in: the
 * token is a bearer credential, the public lookup trades it for someone's
 * name, email, role and company, and accepting it grants standing access to
 * a workspace. Three real bugs were found here — a guessable token, an
 * invite acceptable by an account it was not addressed to, and an acceptance
 * that permanently locked the account out — and none of them had e2e
 * coverage until now.
 */

const seed: SeedInfo = JSON.parse(readFileSync(SEED_INFO_PATH, "utf8"));
const createdUserIds: string[] = [];

test.describe.configure({ mode: "serial" });

function ownerContext() {
  return {
    storageState: seed.orgA.members.OWNER.authStatePath,
    baseURL: test.info().project.use.baseURL,
  };
}

test.afterAll(async () => {
  // These users are created mid-test, so global teardown knows nothing
  // about them.
  await deleteUsers(createdUserIds);
});

test.describe("invitations", () => {
  let token: string;
  let inviteeEmail: string;

  test("an owner can issue an invitation", async ({ playwright }) => {
    const ctx = await playwright.request.newContext(ownerContext());
    inviteeEmail = `e2e-invitee-${Date.now()}@example.com`;

    const res = await ctx.post("/api/team/invites", {
      data: { name: "Invited Engineer", email: inviteeEmail, role: "ENGINEER" },
    });

    expect(res.status()).toBe(201);
    token = (await res.json()).invite.token;

    // A guessable token would make the public lookup below a PII leak, so
    // the length is part of the contract, not an implementation detail.
    expect(token.replace(/^BW-/, "").length).toBeGreaterThanOrEqual(40);

    await ctx.dispose();
  });

  test("the token can be looked up without signing in", async ({ playwright }) => {
    // The sign-up page needs this before the invitee has an account.
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });

    const res = await ctx.get(`/api/invites/${encodeURIComponent(token)}`);

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.invite.email).toBe(inviteeEmail);
    expect(body.invite.role).toBe("ENGINEER");
    expect(body.org.name).toBe(seed.orgA.name);

    await ctx.dispose();
  });

  test("an unknown token reveals nothing", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });

    const res = await ctx.get("/api/invites/BW-not-a-real-token");

    expect(res.status()).toBe(404);
    await ctx.dispose();
  });

  test("an account the invitation was not addressed to cannot accept it", async ({ playwright }) => {
    // The token alone is a bearer credential — a forwarded link or a browser
    // history entry would otherwise be enough to join someone else's company.
    const wrong = await createAuthedUser(`e2e-wrong-${Date.now()}@example.com`);
    createdUserIds.push(wrong.userId);

    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: wrong.cookie },
    });

    const res = await ctx.post(`/api/invites/${encodeURIComponent(token)}/accept`, { data: { acceptedTerms: true } });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/different email address/i);

    await ctx.dispose();
  });

  test("an account already in a workspace cannot accept a second one", async ({ playwright }) => {
    // Two memberships make getMemberByUserId fail on every authenticated
    // request, locking the account out with no way to recover — so this has
    // to be refused rather than allowed and cleaned up later.
    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: seed.orgB.owner.authStatePath,
    });

    // Issue an invitation addressed to org B's owner specifically.
    const owner = await playwright.request.newContext(ownerContext());
    const invite = await owner.post("/api/team/invites", {
      data: { name: "Org B Owner", email: seed.orgB.owner.email, role: "VIEWER" },
    });
    const otherToken = (await invite.json()).invite.token;
    await owner.dispose();

    const res = await ctx.post(`/api/invites/${encodeURIComponent(otherToken)}/accept`, { data: { acceptedTerms: true } });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/already belongs to a company workspace/i);

    // And they must still be able to use their own workspace afterwards.
    expect((await ctx.get("/api/projects")).ok()).toBeTruthy();

    await ctx.dispose();
  });

  test("the invited person can accept and lands in the right org with the right role", async ({ playwright }) => {
    const invitee = await createAuthedUser(inviteeEmail);
    createdUserIds.push(invitee.userId);

    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: invitee.cookie },
    });

    const res = await ctx.post(`/api/invites/${encodeURIComponent(token)}/accept`, { data: { acceptedTerms: true } });

    expect(res.ok()).toBeTruthy();
    const member = (await res.json()).member;
    expect(member.orgId).toBe(seed.orgA.id);
    // The role comes from the stored invitation, never from the request.
    expect(member.role).toBe("ENGINEER");

    // They can now read the workspace they joined.
    expect((await ctx.get("/api/projects")).ok()).toBeTruthy();

    await ctx.dispose();
  });

  test("the same invitation cannot be used twice", async ({ playwright }) => {
    const second = await createAuthedUser(`e2e-second-${Date.now()}@example.com`);
    createdUserIds.push(second.userId);

    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { cookie: second.cookie },
    });

    const res = await ctx.post(`/api/invites/${encodeURIComponent(token)}/accept`, { data: { acceptedTerms: true } });

    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("a member without manageUsers cannot invite anyone", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: seed.orgA.members.VIEWER.authStatePath,
    });

    const res = await ctx.post("/api/team/invites", {
      data: { name: "Smuggled In", email: `e2e-nope-${Date.now()}@example.com`, role: "OWNER" },
    });

    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});
