import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Self-contained Supabase seeding for e2e runs — deliberately independent
 * of the app's own lib/ modules (some of which import next/headers and
 * can't run outside a Next.js request), and deliberately not going through
 * the UI signup wizard, which would make every test run slower and add a
 * second thing that could break unrelated to what's being tested.
 *
 * Three fixtures are created, because the things worth regression-testing
 * can't be reached from a single Owner in a single healthy org:
 *
 *   orgA  the main workspace, with one member per role under test —
 *         needed to prove the permission matrix is actually enforced.
 *   orgB  a second tenant, so cross-org access can be attempted for real
 *         rather than asserted against a mock.
 *   orgC  an org whose trial has already expired, so read-only mode is
 *         exercised without mutating a live subscription mid-run.
 */

const AUTH_DIR = path.join(__dirname, ".auth");
export const SEED_INFO_PATH = path.join(AUTH_DIR, "seed-info.json");

/** The golden-path spec's session; kept at its original path. */
export const AUTH_STATE_PATH = path.join(AUTH_DIR, "owner.json");

export type SeededRole = "OWNER" | "VIEWER" | "SITE_SUPERVISOR";

export interface SeededMember {
  role: string;
  email: string;
  userId: string;
  /** Playwright storageState file for this member. */
  authStatePath: string;
}

export interface SeedInfo {
  /** Org A's owner — the golden path's original fields, unchanged. */
  userId: string;
  orgId: string;
  orgName: string;
  email: string;

  orgA: { id: string; name: string; members: Record<string, SeededMember> };
  orgB: { id: string; name: string; owner: SeededMember };
  orgC: { id: string; name: string; owner: SeededMember };
  orgD: { id: string; name: string; owner: SeededMember; stripeCustomerId: string };

  /** Everything to remove at teardown, whatever shape the fixtures take. */
  orgIds: string[];
  userIds: string[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `e2e setup: ${name} is not set. E2E tests need a real (test) Supabase project — ` +
        `set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }
  return value;
}

function admin() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

/** Signs in and writes a Playwright storageState file for that session. */
async function writeAuthState(email: string, password: string, fileName: string): Promise<string> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const collected: { name: string; value: string; domain: string; path: string }[] = [];
  const browserClient = createBrowserClient(url, anonKey, {
    isSingleton: false,
    cookies: {
      getAll: () => collected,
      setAll: (cookiesToSet) => {
        for (const c of cookiesToSet) {
          const idx = collected.findIndex((existing) => existing.name === c.name);
          const entry = { name: c.name, value: c.value, domain: "localhost", path: "/" };
          if (idx >= 0) collected[idx] = entry;
          else collected.push(entry);
        }
      },
    },
  });
  const { error } = await browserClient.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const filePath = path.join(AUTH_DIR, fileName);
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({
      cookies: collected.map((c) => ({
        ...c,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
        expires: -1,
      })),
      origins: [],
    }),
  );
  return filePath;
}

async function createOrg(name: string): Promise<string> {
  const { data, error } = await admin().from("organizations").insert({ name }).select("*").single();
  if (error) throw error;
  return data.id;
}

async function createMember(
  orgId: string,
  role: string,
  runId: string,
  fileName: string,
): Promise<SeededMember> {
  const email = `e2e-${role.toLowerCase().replace(/_/g, "-")}-${runId}@example.com`;
  const password = `E2ePilot!${runId}`;

  const { data: created, error: createErr } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");

  const { error: memberErr } = await admin().from("org_members").insert({
    org_id: orgId,
    user_id: created.user.id,
    name: `E2E ${role}`,
    email,
    role,
    active: true,
  });
  if (memberErr) throw memberErr;

  const authStatePath = await writeAuthState(email, password, fileName);
  return { role, email, userId: created.user.id, authStatePath };
}

/**
 * Admin client for specs that need to set up or clean up their own fixtures
 * (an invitee who does not exist until the test runs, for instance). Tests
 * are the one place the service-role key is legitimately used directly.
 */
export function adminClient() {
  return admin();
}

/** Creates a confirmed auth user with no org membership, and signs them in. */
export async function createAuthedUser(email: string): Promise<{ userId: string; cookie: string }> {
  const password = `E2eUser!${Date.now()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const jar: { name: string; value: string }[] = [];
  const browserClient = createBrowserClient(url, anonKey, {
    isSingleton: false,
    cookies: {
      getAll: () => jar.map((c) => ({ ...c })),
      setAll: (cookiesToSet) => {
        for (const c of cookiesToSet) {
          const idx = jar.findIndex((existing) => existing.name === c.name);
          const entry = { name: c.name, value: c.value };
          if (idx >= 0) jar[idx] = entry;
          else jar.push(entry);
        }
      },
    },
  });
  const { error: signInErr } = await browserClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return {
    userId: data.user.id,
    cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}

export async function deleteUsers(userIds: string[]): Promise<void> {
  for (const id of userIds) {
    await admin().auth.admin.deleteUser(id);
  }
}

export async function seedOwnerSession(): Promise<SeedInfo> {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const orgIds: string[] = [];
  const userIds: string[] = [];

  // --- Org A: the main workspace, one member per role under test ---
  const orgAName = `E2E Test Co ${runId}`;
  const orgAId = await createOrg(orgAName);
  orgIds.push(orgAId);

  const members: Record<string, SeededMember> = {};
  // The Owner keeps the original filename so the golden path is untouched.
  members.OWNER = await createMember(orgAId, "OWNER", `a-${runId}`, "owner.json");
  members.VIEWER = await createMember(orgAId, "VIEWER", `a-${runId}`, "viewer.json");
  members.SITE_SUPERVISOR = await createMember(orgAId, "SITE_SUPERVISOR", `a-${runId}`, "supervisor.json");
  for (const m of Object.values(members)) userIds.push(m.userId);

  // --- Org B: a genuinely separate tenant ---
  const orgBName = `E2E Other Co ${runId}`;
  const orgBId = await createOrg(orgBName);
  orgIds.push(orgBId);
  const orgBOwner = await createMember(orgBId, "OWNER", `b-${runId}`, "orgb-owner.json");
  userIds.push(orgBOwner.userId);

  // --- Org C: trial already expired, so the workspace is read-only ---
  const orgCName = `E2E Expired Co ${runId}`;
  const orgCId = await createOrg(orgCName);
  orgIds.push(orgCId);
  const orgCOwner = await createMember(orgCId, "OWNER", `c-${runId}`, "orgc-owner.json");
  userIds.push(orgCOwner.userId);

  // Insert the subscription directly rather than letting the app lazily
  // create a healthy trial on first request.
  const { error: subErr } = await admin().from("org_subscriptions").insert({
    org_id: orgCId,
    plan: "PROFESSIONAL",
    status: "TRIALING",
    trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
  });
  if (subErr) throw subErr;

  // --- Org D: has a Stripe customer, so webhook events have somewhere to land ---
  const orgDName = `E2E Billing Co ${runId}`;
  const orgDId = await createOrg(orgDName);
  orgIds.push(orgDId);
  const orgDOwner = await createMember(orgDId, "OWNER", `d-${runId}`, "orgd-owner.json");
  userIds.push(orgDOwner.userId);

  const stripeCustomerId = `cus_e2e_${runId.replace(/-/g, "")}`;
  const { error: subDErr } = await admin().from("org_subscriptions").insert({
    org_id: orgDId,
    plan: "STARTER",
    status: "TRIALING",
    trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    stripe_customer_id: stripeCustomerId,
  });
  if (subDErr) throw subDErr;

  const info: SeedInfo = {
    userId: members.OWNER.userId,
    orgId: orgAId,
    orgName: orgAName,
    email: members.OWNER.email,
    orgA: { id: orgAId, name: orgAName, members },
    orgB: { id: orgBId, name: orgBName, owner: orgBOwner },
    orgC: { id: orgCId, name: orgCName, owner: orgCOwner },
    orgD: { id: orgDId, name: orgDName, owner: orgDOwner, stripeCustomerId },
    orgIds,
    userIds,
  };
  await writeFile(SEED_INFO_PATH, JSON.stringify(info, null, 2));
  return info;
}

export async function teardownOwnerSession(): Promise<void> {
  const client = admin();
  const { readFile } = await import("node:fs/promises");
  let info: SeedInfo;
  try {
    info = JSON.parse(await readFile(SEED_INFO_PATH, "utf8"));
  } catch {
    return; // nothing to clean up (setup never ran, or already torn down)
  }

  // Uploaded objects are not covered by the database cascade.
  for (const orgId of info.orgIds) {
    const { data: objects } = await client.storage.from("uploads").list(orgId);
    if (objects?.length) {
      await client.storage.from("uploads").remove(objects.map((o) => `${orgId}/${o.name}`));
    }
  }

  // organizations -> org_members/projects/etc. all cascade on delete.
  for (const orgId of info.orgIds) {
    const { error } = await client.from("organizations").delete().eq("id", orgId);
    if (error) throw new Error(`e2e teardown: failed to delete org ${orgId}: ${error.message}`);
  }

  for (const userId of info.userIds) {
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) throw new Error(`e2e teardown: failed to delete user ${userId}: ${error.message}`);
  }
}
