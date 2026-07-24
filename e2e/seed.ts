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
 */

export const AUTH_STATE_PATH = path.join(__dirname, ".auth", "owner.json");
export const SEED_INFO_PATH = path.join(__dirname, ".auth", "seed-info.json");

export interface SeedInfo {
  userId: string;
  orgId: string;
  orgName: string;
  email: string;
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

export async function seedOwnerSession(): Promise<SeedInfo> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceRoleKey);
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${runId}@example.com`;
  const password = `E2ePilot!${runId}`;
  const orgName = `E2E Test Co ${runId}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");

  const { data: orgRow, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: orgName })
    .select("*")
    .single();
  if (orgErr) throw orgErr;

  const { error: memberErr } = await admin.from("org_members").insert({
    org_id: orgRow.id,
    user_id: created.user.id,
    name: "E2E Owner",
    email,
    role: "OWNER",
    active: true,
  });
  if (memberErr) throw memberErr;

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
  const { error: signInErr } = await browserClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  await mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await writeFile(
    AUTH_STATE_PATH,
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

  const info: SeedInfo = { userId: created.user.id, orgId: orgRow.id, orgName, email };
  await writeFile(SEED_INFO_PATH, JSON.stringify(info));
  return info;
}

export async function teardownOwnerSession(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey);

  const { readFile } = await import("node:fs/promises");
  let info: SeedInfo;
  try {
    info = JSON.parse(await readFile(SEED_INFO_PATH, "utf8"));
  } catch {
    return; // nothing to clean up (setup never ran, or already torn down)
  }

  // organizations -> org_members/projects/etc. all cascade on delete.
  const { error: deleteOrgErr } = await admin.from("organizations").delete().eq("id", info.orgId);
  if (deleteOrgErr) throw new Error(`e2e teardown: failed to delete org ${info.orgId}: ${deleteOrgErr.message}`);

  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(info.userId);
  if (deleteUserErr) throw new Error(`e2e teardown: failed to delete user ${info.userId}: ${deleteUserErr.message}`);
}
