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

Setup seeds three orgs, because the things worth regression-testing can't be
reached from one Owner in one healthy workspace:

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

Teardown removes all three orgs, their users, and any objects they uploaded
to storage.

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

### One instance, for now

Rate limiting keeps its buckets in process memory. Each replica would enforce
its own budget, so N replicas means roughly N times every limit, and a
restart forgets them. Run a single instance until that moves to a shared
store (Redis/Upstash); the app logs a warning at boot in production as a
reminder, silenced with `RATE_LIMIT_MULTI_INSTANCE_ACK=1`.

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
