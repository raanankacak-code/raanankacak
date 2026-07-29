# BinaWorks

Construction & contractor site management for Sarawak-based contractors — daily
reports, attendance, and project tracking, scoped per-company with role-based
access.

This started as a static HTML/CSS/JS design prototype and is being rebuilt as
a real Next.js app with a Postgres (Supabase) database and Supabase Auth.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Supabase** — Postgres database + Auth (email/password)
- **supabase-js**, no ORM — reads via a session-bound client (subject to RLS),
  writes via a server-only service-role client
- Plain CSS design system ported from the original prototype (no Tailwind)
- **Supabase Storage** (private bucket) for uploaded photos/documents/logos

## What's built

- Sign up (creates a company workspace, you become Owner) / sign in / invites
- Multi-tenant orgs with role-based permissions (`lib/permissions.ts`),
  enforced in the app *and* by Postgres row-level security
- Projects — create/edit/delete, worker roster, documents, cost reports
- Daily reports — weather, manpower by trade, work completed, site photos
- Attendance — daily check-in grid (Present/Half/Absent), CIDB Green Card
  expiry flags, monthly summary + CSV export
- Materials/procurement with an approval workflow and full audit trail
- Calendar, notifications, team management, company settings, global search,
  help centre, bug reports
- Billing — trials, plan limits, Stripe checkout and webhooks, read-only mode
  when a subscription lapses
- Audit log (append-only at the database level)

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**.
2. Set a strong database password (save it) and pick a nearby region.
3. Once ready, go to **Project Settings → API** and copy the **Project URL**,
   **anon public key**, and **service_role key**.
4. Go to **Project Settings → Database → Connection string** and copy the
   **URI** (pooler mode is fine).
5. Under **Authentication → Sign In / Providers → Email**, consider turning
   **off** "Confirm email" for local development so sign-up immediately
   returns a session (the app still works either way — see
   `app/signup/page.tsx`).

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from step 1.

### 3. Create the database schema

Open `supabase/schema.sql` and run its contents in the Supabase SQL Editor
(Project → SQL Editor → New query). This creates the tables, enums, and
indexes the app expects, along with the row-level security policies.

Every tenant-scoped **read** goes through a session-bound client (anon key +
the caller's JWT), so those RLS policies are load-bearing: a query that lost
its `org_id` filter would still only ever return the caller's own org's rows.
**Writes** use the server-only service-role client (`lib/supabase/admin.ts`),
which bypasses RLS, so the app's own checks in `lib/auth.ts` and
`lib/permissions.ts` are what gate those.

### 4. Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll land on
`/login`. Use "Create one" to sign up and set up your company workspace.

## Testing

```bash
npm test          # unit & integration tests (Vitest)
npm run test:e2e  # end-to-end tests (Playwright)
```

Vitest runs in the `node` environment by default — most of these tests are
permission matrices, query builders and pure rules, and a DOM they never
touch only makes them slower. Component tests opt in with a
`// @vitest-environment jsdom` docblock at the top of the file, which has the
side benefit of saying, in one line, that this file renders something.

Two of them are worth knowing about: `lib/contrast.test.ts` reads the palette
straight out of `app/globals.css` and measures every text colour against every
surface it can land on, so a colour cannot be changed without the measurement
changing with it; and `components/app/Modal.test.tsx` pins the focus trap,
which is the kind of thing that is easy to break and invisible until someone
tries to use the app without a mouse.

`npm run test:e2e` needs a real (test) Supabase project — it seeds throwaway
orgs and users directly via the service-role key, runs the specs against a
production build (`npm run build && npm run start`, via Playwright's
`webServer`), then deletes everything it created. Set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` in `.env` (loaded automatically by
`playwright.config.ts` via `process.loadEnvFile()`) — **use a test project,
not production**, since the suite creates and deletes real rows.

The first time you run it on a given machine, download Playwright's browser
binary once:

```bash
npx playwright install chromium
```

In CI (`.github/workflows/ci.yml`) this happens automatically and the same
three Supabase values must be set as repository secrets; the `e2e` job skips
itself with a warning if they're missing.

### What the e2e suite covers

Setup seeds four orgs, because the things worth regression-testing can't be
reached from one Owner in one healthy workspace — a second tenant, an expired
trial, and a Stripe customer are each needed:

- **`golden-path`** — the daily loop end to end: create a project, add a
  worker, file a report, take attendance, raise and approve a material
  request, see it on the audit log. Also fails on any CSP violation or page
  error, so tightening the policy too far breaks the build rather than
  silently killing a button.
- **`tenant-isolation`** — a second org attempts to read the first org's
  project, report and uploaded file by id, and via the listing endpoints.
  It ends by proving the *owning* org can still read the same ids, so a
  mis-assigned fixture can't produce a false pass.
- **`permissions`** — a Viewer is refused calendar writes, project creation,
  report submission and uploads; a Site Supervisor is allowed the calendar
  and uploads but still refused team and billing. Both directions matter: a
  role check is only right if the roles that need the feature keep it.
- **`read-only-mode`** — an org whose trial has already expired can still
  read and export everything but is refused every write with a 402, and a
  healthy org is unaffected.
- **`invites`** — issue, public lookup, and acceptance, pinning the three
  bugs found in that flow: token length, an account the invitation was not
  addressed to, and an account already in a workspace.
- **`stripe-webhook`** — signatures are produced in the spec, so forged and
  mismatched signatures, activation, `past_due`, transient statuses,
  unrecognised prices and unknown customers are all covered without a Stripe
  account or a network call.
- **`export-and-delete`** — the export is complete, tenant-scoped, redacts
  invite tokens and works while read-only; deletion is refused for non-Owners
  and for a mistyped name, and when it does run it removes storage objects
  while leaving sign-in accounts intact.
- **`safety`** — an inspection is filed, its evidence survives, and both the
  record page and its per-finding uploads are unreachable by another tenant
  and by a signed-out visitor.
- **`not-found`** — a missing id, a malformed id and a signed-out request
  each land somewhere branded rather than on a database error or Next's
  default page, and the soft 404 carries `noindex`.
- **`accessibility`** — hand-written checks for the things a scanner cannot
  judge (focus goes into a dialog and comes back out, the skip link works,
  sort state is announced, no `label` points at a control that does not
  exist), plus an **axe-core scan of every sidebar page**, the signed-out
  sign-in page and an open dialog, restricted to WCAG A and AA. Best-practice
  rules are excluded on purpose: they are opinions, and a suite that fails on
  an opinion gets muted.

Teardown removes every seeded org, their users, and any objects they
uploaded to storage. Specs that create users mid-run (an invitee does not
exist until the test runs) clean those up themselves.

## File uploads

Daily report photos, project documents and the company logo are stored in a
**private** Supabase Storage bucket named `uploads`, keyed `{orgId}/{file}`.
No local filesystem is involved, so the app runs fine on ephemeral or
serverless hosts.

The bucket has **no storage RLS policies**, which means the anon and
authenticated keys cannot read it at all — the only way to reach a file is
through `app/api/uploads/[...path]`, which checks that the caller's org
matches the object's org prefix before streaming it back. That one check is
what enforces tenant isolation for every file in the app, so stored URLs stay
in the app's own `/api/uploads/...` form rather than pointing at storage
directly (a public bucket would make every site photo world-readable; signed
URLs expire, so they can't be what's persisted in the database).

Uploads are capped at 20MB and restricted to an allow-list of image, PDF,
Office and plain-text types, enforced both in the route and on the bucket
itself. Filenames are always server-generated UUIDs — the client-supplied
name is never used as a path.

Creating the bucket on a fresh Supabase project:

```js
await admin.storage.createBucket("uploads", { public: false, fileSizeLimit: 20971520 });
```

## Export and deletion

**Export** — Company Settings → *Your data* downloads the whole workspace as
one JSON file (`GET /api/orgs/export`): every project, report, worker,
attendance record, material request, document record, calendar event and the
audit log. Requires `manageOrg`.

It works while the workspace is read-only, on purpose — the Billing page
promises that when a trial lapses "all data is safe and can still be viewed
and exported", and being locked out of your own site records over a lapsed
card would be far worse than being refused a write.

Pending invitation tokens are redacted. A token is a bearer credential, and
an export is a file that gets emailed around.

**Deletion** — Company Settings → *Delete this company* removes the
organisation and everything in it, including uploaded files (the database
cascade does not reach the storage bucket, so that is done explicitly).

Owner-only, and the company name has to be typed to confirm. `manageOrg` is
deliberately not enough: an Admin can run the workspace day to day without
being able to end it.

**Sign-in accounts survive.** Members lose their membership and land back on
the create-a-company screen, but keep their login — one Owner should not be
able to destroy a colleague's account, which may be used for another
workspace or a future invitation.

## Logging & error tracking

Server code logs one JSON object per line (`lib/logger.ts`), so any collector
(Docker, journald, CloudWatch, Loki) can parse fields without regexes.

Unexpected failures reach the logs two ways:

- **API routes** funnel through `apiErrorResponse`, which logs the full stack
  under a random `errorId` and returns only that id to the client. A user
  quoting the id (e.g. via the bug-report form) is enough to find the exact
  trace.
- **Everything else** — errors thrown while rendering a page or Server
  Component, or inside the proxy — is caught by `onRequestError` in
  `instrumentation.ts`, which adds the route path, method and route type.
  Without it those failed with a generic error page and nothing in the logs.

Requests that end because the **caller went away** (navigated mid-fetch,
closed the tab, lost signal on site) are logged at `info` with
`reason: "client-disconnect"`, not as errors. They are routine on a
mobile-heavy app, and counting them as errors would bury real failures — this
was the recurring `aborted`/`ECONNRESET` noise visible in every test run.

### Adding a hosted error tracker

`lib/logger.ts` exposes one seam, `setErrorReporter`. Call it once from
`register()` in `instrumentation.ts` and every `reportError` call site starts
reporting — no per-route wiring, and client disconnects are filtered out for
you:

```ts
import * as Sentry from "@sentry/nextjs";
setErrorReporter((err, context) => Sentry.captureException(err, { extra: context }));
```

No SDK is installed yet: one that isn't configured is just weight in the
bundle.

## Deploying

The app runs as a normal Node server (`npm run build && npm run start`). No
persistent filesystem is needed — uploads live in Supabase Storage.

### Put it behind a reverse proxy, and don't expose it directly

This matters for more than TLS. Route Handlers expose no socket address, so
`X-Forwarded-For` is the only client-IP signal available, and every IP-keyed
rate limit depends on it. If clients can reach the app directly they control
that header outright and can bypass those limits by rotating it.

- Bind the app to localhost (or a private network) and let the proxy be the
  only way in.
- Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the app —
  `1` for a single nginx/Caddy, `2` behind a CDN as well. The client IP is
  read that many entries in from the right of the header; anything to the
  left is caller-supplied and ignored.
- Set `NEXT_PUBLIC_APP_URL` to the deployment's public origin, and pin `Host`
  at the proxy. Invite links and Stripe return URLs used to be built from
  `new URL(request.url).origin`, which is the `Host` header: a proxy that
  passes an arbitrary `Host` through lets a caller decide where the "Accept
  invitation" button in an invite email points, in a message that is
  otherwise entirely genuine. With the variable set the header no longer
  decides. Without it the app falls back to the request host and logs a
  warning for every link it builds.

### Scaling out

Rate-limit buckets live in Postgres (`rate_limits`, via the
`check_rate_limit` function), so every instance shares one budget and limits
survive a restart. Run as many replicas as you like.

The check and the increment happen in a single SQL statement — splitting them
would let two concurrent requests both read `count = limit - 1` and both
proceed, which is the race a shared store exists to close.

If the store is unreachable the request is *allowed* and the failure logged:
rate limiting is a guard, not the thing the caller asked for, and turning a
database blip into a 429 for everyone is the worse outage. Old buckets can be
swept with `select prune_rate_limits();` — optional, since the table only
holds one row per active key.

### Required configuration

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are checked at boot — the server refuses to start
without them rather than failing on a user's first request. Everything else
in `.env.example` is optional and degrades gracefully (no Stripe key means
the Billing page says "contact support"; no Resend key means invites still
work but send no email).

The `uploads` storage bucket must exist — see **File uploads** above.

### Security headers

Set in `next.config.ts` (static) and `proxy.ts` (the per-request CSP):
HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`, and a Content-Security-Policy whose `script-src` uses a
per-request nonce with `strict-dynamic`.

Two consequences worth knowing:

- **Every page is dynamically rendered** (`export const dynamic` in
  `app/layout.tsx`). Nonces can only be applied while server-rendering, and
  under `strict-dynamic` a nonce-less script is simply blocked — a
  prerendered page would ship with no working JavaScript.
- **`style-src` allows `'unsafe-inline'`.** The UI sets React `style` props
  throughout, which render as inline style attributes a nonce cannot cover.
  Locking this down would mean restyling the app; the exposure is style
  injection, not code execution, and scripts stay strict.

The e2e suite asserts that no CSP violation or page error occurs during the
golden path, so tightening the policy too far fails the build rather than
silently breaking a button in production.

### Health check

`GET /api/health` returns `{ status, db, latencyMs }` and actually queries the
database, so it fails when Postgres is unreachable rather than only when the
process is dead. Point your load balancer or uptime monitor at it.

The health check is also how a bad config keeps traffic away. The app
validates its environment at boot (`lib/config.ts`); when something fatal is
missing the process stays up but every request — including `/api/health` —
returns 500, so a load balancer never routes to that instance and a rolling
deploy stops rather than half-completing.

What is fatal, and why each one:

| Setting | Missing | Reason |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `..._ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | fatal | Nothing works without them |
| `NEXT_PUBLIC_APP_URL` | fatal in production | Invite links fall back to the `Host` header, which a caller can forge |
| `TRUSTED_PROXY_HOPS` | warning | `1` is a defensible default; a *malformed* value is fatal |
| `STRIPE_SECRET_KEY` without `STRIPE_WEBHOOK_SECRET` | fatal | Checkout would succeed and the subscription never activate |

The middle two are the interesting ones: the app runs perfectly well without
either, and does the wrong thing quietly. That is precisely why they fail
loudly instead of being left to a code review.

### Soft 404s

Pages that call `notFound()` answer `200`, not `404`. Next streams any dynamic
App Router response, and once streaming begins the status has already been
sent — a real status would need `notFound()` to fire before the first `await`,
which a database lookup cannot do. This is not caused by `force-dynamic` or by
`loading.tsx`; both were removed and rebuilt while checking, and the status
stayed `200`.

The consequence that matters is indexing, and Next handles it: it injects
`<meta name="robots" content="noindex">` when `notFound()` fires mid-stream.
The e2e suite asserts that rather than the status code. Everything affected is
behind sign-in, so nothing crawls it in the first place.

### Before you go live

Run `get_advisors` (or Supabase → Advisors) and expect exactly three findings,
each a decision rather than an oversight:

- **`rate_limits` has RLS enabled and no policies** (INFO). Deliberate
  deny-all. The table is reached only by the service role through
  `check_rate_limit()`, so there is no policy to write — a policy would be
  the thing that opened it up. Documented in a table comment; the linter
  still reports it, because a comment cannot clear a lint.
- **`auth_org_id()` is executable by `authenticated`** (WARN). Required, not
  an oversight: RLS policy expressions are evaluated with the *caller's*
  privileges, so revoking this grant would break every tenant-scoped read in
  the app. Calling it over RPC returns the caller's own org id — something
  they already know.
- **Leaked password protection is disabled** (WARN). This one is worth
  fixing and cannot be done from SQL. Turn it on at
  **Authentication → Policies → Password protection**; it checks new
  passwords against HaveIBeenPwned. Do this before real customers sign up.

### Dependency advisories

`npm audit --omit=dev` reports **0 vulnerabilities**, and CI fails if that
changes. Getting there needed two `overrides` in `package.json`, because npm's
own suggestion was not usable:

```
fix available via `npm audit fix --force`
Will install next@9.3.3, which is a breaking change
```

That is a six-year downgrade across seven major versions. It is also not a
fix: the advisory range for `next` covers every released 16.x, so no upgrade
path existed. The vulnerable packages were the two it pulls in, and those are
what the overrides move:

- **`postcss` → 8.5.24.** `next` carried its own nested `postcss@8.4.31`
  underneath the already-patched top-level copy — XSS via an unescaped
  `</style>` in stringify output, and arbitrary file read via an
  attacker-controlled `sourceMappingURL`. Build-time only, on CSS in this
  repo, so the practical risk here was low; the override deduplicates the
  nested copy away entirely.
- **`sharp` → 0.35.3.** Four inherited libvips CVEs. `next.config.ts` sets
  `images: { unoptimized: true }`, which removes `/_next/image`, so sharp is
  never actually invoked at runtime — this is defence in depth rather than a
  live hole being closed.

`lib/dependencies.test.ts` is the ratchet: it reads `package-lock.json` and
fails if any copy of either package — hoisted or nested — resolves below the
patched version. It runs offline, so unlike `npm audit` it works in CI
without an advisory database and cannot be quietly skipped.

**The dev tree still reports 9 high-severity advisories, and that is
deliberate.** All nine trace to one root: `brace-expansion <=5.0.7` (DoS via
unbounded expansion), reached through the `minimatch` that `eslint` and its
plugins depend on. The only patched release is 5.0.8, and forcing it produces
a clean `npm audit` and a broken linter:

```
TypeError: expand is not a function
  at Minimatch.braceExpand (node_modules/minimatch/minimatch.js:271)
```

`brace-expansion@5` is no longer a callable CommonJS export, and `minimatch@3`
calls it as one. npm's real fix is `eslint@10`, a major upgrade that
`eslint-config-next` does not yet support. A denial of service in glob
expansion, in a package that only runs when someone lints, is not worth a
broken toolchain — so the override was tried, measured, and removed, and a
test asserts it stays removed. Revisit when `eslint-config-next` supports
eslint 10.

Two more manual steps, neither expressible in a migration:

- Confirm the automated backup retention on your plan (Project → Database →
  Backups) and write the number down somewhere that is not this file.
- Set up a backup for the `uploads` storage bucket. Database backups do not
  include it — see below.

## Backup and restore

Two things have to survive, and they are backed up by different mechanisms.
Losing track of that is the usual way a "we have backups" turns out not to.

**1. The database.** Supabase takes automated backups; the retention window
depends on the plan, so check Project → Database → Backups and know your
number before you need it. Backups are point-in-time restores of Postgres —
they cover every table, every row, and the auth schema.

**2. Storage objects.** Uploaded photos, documents and logos live in the
private `uploads` bucket, which is **not** part of a database backup.
Restoring the database alone gives you rows whose `url` columns point at
objects that no longer exist. Back the bucket up separately.

### Restoring

```bash
# 1. Restore the database from the Supabase dashboard
#    (Project -> Database -> Backups -> Restore).

# 2. Confirm the guardrails came back, not just the tables. This is the
#    check that matters: a schema can restore looking correct while having
#    lost the things that keep it safe.
psql "$DATABASE_URL" -c "select count(*) from pg_policies where schemaname='public';"
psql "$DATABASE_URL" -c "select evtname from pg_event_trigger where evtname='ensure_rls';"
psql "$DATABASE_URL" -c "select jobname, schedule from cron.job;"

# 3. Restore the storage bucket, then verify nothing dangles:
#    every document row should have a matching object.
```

`supabase/schema.sql` is the source of truth for schema *and* for those
guardrails — the RLS policies, the append-only audit triggers, the
`ensure_rls` event trigger and the pruning job are all in it. That was not
always true: `ensure_rls` existed only in the live database for a while,
which meant a rebuild from this file would have produced a database that
looked right and silently no longer enforced RLS on new tables. If you apply
something directly to the database, put it in this file in the same sitting.

### What to check after any restore

- `select count(*) from pg_policies where schemaname = 'public'` — should be 15.
- `ensure_rls` event trigger present.
- `cron.job` contains `prune-rate-limits`.
- `GET /api/health` returns 200.
- Sign in, open a project, and open one uploaded document — that exercises
  the database, the session, and storage in one go.

## Project structure

```
app/
  (app)/            authenticated routes (dashboard, projects, reports, attendance)
  api/               REST route handlers (the "backend")
  login/, signup/    auth pages
lib/
  supabase/          browser/server/admin Supabase clients
  db/                 data-access modules (supabase-js queries + row mappers)
  auth.ts            getCurrentMember() / requireMember() for route handlers
  permissions.ts      role → permission matrix
supabase/schema.sql   data model (run once in the Supabase SQL Editor)
proxy.ts               session refresh + route guarding (Next 16's renamed middleware)
```
