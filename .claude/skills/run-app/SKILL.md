---
name: run-app
description: Launch BinaWorks and drive it in a browser as a signed-in Owner — build, serve, mint a session, screenshot the screens. Use when asked to run, start, walk through or screenshot the app, or to confirm a change works in the real app rather than in tests.
---

# Running BinaWorks

Next.js 16 app on Supabase. There is no local database — every environment,
including this one, talks to the live Supabase project in `.env`. Anything
you seed is real; clean it up (see the last section).

## Build and serve

The production build is what to test: `next dev` compiles routes on demand
and the first paint on each route is slow enough to hide real problems.

```bash
npm run build
PORT=3200 NEXT_PUBLIC_APP_URL=http://localhost:3200 TRUSTED_PROXY_HOPS=1 \
STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_x \
STRIPE_PRICE_STARTER=price_s STRIPE_PRICE_PROFESSIONAL=price_p STRIPE_PRICE_BUSINESS=price_b \
npm run start -- -p 3200 > /tmp/server.log 2>&1 &
timeout 90 bash -c 'until curl -sf http://localhost:3200/ >/dev/null; do sleep 1; done'
```

`NEXT_PUBLIC_APP_URL` and `TRUSTED_PROXY_HOPS` are not optional — the
production build refuses to boot without them (see `lib/config.ts`). The
Stripe values only need to be present; nothing contacts Stripe.

### Stopping it — the part that wastes an afternoon

`lsof -ti:3200 | xargs kill` **does not stop this server**. npm does not
forward the signal to the `next-server` process it spawned, and `lsof` may
report nothing while the port is still held. Kill the actual process:

```bash
ps -eo pid,cmd | grep -E "next-server|next start" | grep -v grep
kill <next-server-pid> <sh-pid> <npm-pid>
curl -sf -o /dev/null http://localhost:3200/ && echo "STILL SERVING" || echo "port free"
```

A server left running serves the **old build**, so a rebuild appears to
change nothing and you will "fix" the same bug twice. If a change does not
show up on screen, check this first.

## Signing in

**The headless browser cannot reach Supabase from this container.** The
sign-in form posts to `/auth/v1/token` and hangs forever — the page is fine,
the network is not. Mint the session in Node and load it as cookies, which
is what `e2e/seed.ts` does for the suite:

```js
import { createBrowserClient } from "@supabase/ssr";
const collected = [];
const client = createBrowserClient(url, anonKey, {
  isSingleton: false,
  cookies: {
    getAll: () => collected,
    setAll: (set) => { for (const c of set) collected.push({ name: c.name, value: c.value, domain: "localhost", path: "/" }); },
  },
});
await client.auth.signInWithPassword({ email, password });
// -> browser.newContext({ storageState: { cookies: collected.map(c => ({ ...c, httpOnly: false, secure: false, sameSite: "Lax", expires: -1 })), origins: [] } })
```

There is no `chromium-cli` here. Drive with Playwright directly, pointing at
the preinstalled browser: `chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })`.

## Seeding something worth looking at

An empty workspace renders empty states and proves nothing. Insert with the
service-role key; required columns that are easy to miss: `defects.code`,
`documents.size_bytes` / `uploaded_by_id` / `uploaded_by_name`,
`daily_reports.submitted_by_id`. The uploads bucket has a MIME allowlist —
`image/png` works, `application/octet-stream` is rejected with 415.

Two shapes are worth building deliberately, because both hid real bugs:

- **Odd daily rates with an odd number of half days** (e.g. RM 155, 13 full
  + 13 half). Wages land on `.50`, which is what makes a wages column
  disagree with its own total when money is rounded per cell.
- **More than 1000 rows** in a table you are about to read. PostgREST caps
  an unranged select there silently. See "The thousand-row cap" in README.

## Watching the clock

Orgs run on `Asia/Kuching`; the server is UTC, eight hours behind. Between
local midnight and 08:00 the two disagree, and that window is where the date
bugs live. **Walking the app inside it found a dashboard bug that a grep of
the source had missed.** If you are looking for date problems, check what
time it is where the workspace is:

```bash
node -e 'console.log(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuching",dateStyle:"short",timeStyle:"short"}).format(new Date()))'
```

## Check the screenshots, and the console

`page.on("console")` for errors and `page.on("response")` for status >= 400.
A page can render its shell while every fetch behind it fails. Look at the
image too — the bug that started this skill was two dates a day apart on one
screen, which no assertion was watching for.

## Clean up

The Supabase project is shared and real. Delete what you seeded, by name
prefix rather than by a saved id — a seed that fails halfway still leaves an
org and an auth user behind:

```js
const { data: orgs } = await db.from("organizations").select("id,name").like("name", "WALK%");
for (const o of orgs) {
  await db.from("legal_acceptances").delete().eq("org_id", o.id);   // no FK, will not cascade
  await db.from("deleted_workspaces").delete().eq("org_id", o.id);  // ditto
  await db.from("organizations").delete().eq("id", o.id);
}
const { data: users } = await db.auth.admin.listUsers();
for (const u of users.users.filter(u => u.email?.startsWith("walk-"))) await db.auth.admin.deleteUser(u.id);
```

Storage objects are not covered by the database cascade either. Sweep any
`uploads/<folder>` whose folder is not a live organization id.
