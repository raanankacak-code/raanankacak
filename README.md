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
- Safety inspections — dated, attributed, photo evidence, printable record
- Defect management — snag lists per project, with a photo of the problem and
  a photo of the fix, and sign-off by someone other than whoever fixed it
- Equipment register — plant owned or hired, hours logged per machine, and
  service and statutory-inspection dates surfaced before they lapse
- Calendar, notifications, team management, company settings, global search,
  help centre, bug reports
- Billing — trials, plan limits, Stripe checkout and webhooks, read-only mode
  when a subscription lapses
- Client access — your customer gets a login of their own, restricted to the
  projects you list for them: progress, the site diary and its photos, the
  safety record and the snag list — and sign-off, recorded with their name
  and the date and unchangeable afterwards
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
npm run smoke -- https://app.example.com   # post-deploy check against a live URL
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
- **`defects`** — the snag-list rules that only exist because a defect is
  evidence rather than a to-do item: a Site Supervisor can resolve one but
  cannot sign it off, "resolved" is refused without notes or a photo, a closed
  defect cannot be reopened, the caller cannot dictate the status or the
  reference, and an assignee in another workspace is rejected.
- **`smoke-check`** — runs `scripts/smoke.mjs` against the suite's own
  production build, so the post-deploy check is itself covered. Includes a
  deliberate failure case and a bad-argument case: a smoke check that cannot
  fail is decoration.
- **`equipment`** — hours are summed from the logs by a `security_invoker`
  view rather than a stored total that could drift, an impossible 25-hour day
  is refused, a retired machine stops accepting hours, a Site Supervisor can
  log usage but not register plant, and deleting a project releases its
  machines to the yard instead of destroying the register with the site.
- **`not-found`** — a missing id, a malformed id and a signed-out request
  each land somewhere branded rather than on a database error or Next's
  default page, and the soft 404 carries `noindex`.
- **`client-portal`** — the client role, checked twice: once through the app
  (every internal route answers 403, the portal shows one project, another
  project's page is a 404) and once by querying PostgREST directly with the
  client's own JWT, which is the row-level security policies themselves
  passing or failing. Each staff-only table is proved to *have* rows before
  the client is shown none of them — an empty answer from an empty table is
  not a policy working.
- **`approvals`** — client sign-off, tested for what cannot happen to a
  record: a decision cannot be re-made, a rejection cannot be withdrawn out
  of existence, the name on the signature comes from the signed-in account
  rather than the request body, staff cannot sign on the client's behalf, and
  revoking access does not rewrite what was already signed. The last two
  tests go straight at the database to prove the CHECK constraints, because
  the route handler is only the first of the two locks.
- **`mobile`** — the whole suite runs at 1280px except this one, which runs
  at 390×844 and asks the questions a screenshot answers: the bottom nav is
  laid out, marks where you are and can be tapped; every list page, plus the
  dashboard and the calendar, fits the screen with no sideways scroll; each
  row is a labelled card rather than a table with its important columns off
  the edge; and nothing on those pages is a smaller tap target than WCAG 2.2
  asks for. It seeds a row on every list page first — including a worker, so
  attendance has something to show — because an empty page proves nothing
  about a layout.
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

## Client access

Your customer can have a login. It shows them their own project — progress,
the site diary and its photographs, the safety record and the snag list — and
nothing else: not costs, not material requests, not the workers or their IC
numbers, not the plant register, not your other jobs, not your staff list.

Invite one from **Team → Invite User**, choose the **Client** role, and tick
the projects they may see. They get the same invitation email as an employee;
accepting it lands them on `/portal` instead of the dashboard. Client accounts
do not count against the team-account limit on your plan.

### Sign-off

The contractor raises a request against a project — a stage, a milestone, a
completed section — from **Projects → (a project) → Client**. It appears in
the client's portal, and they approve or reject it. Their answer is recorded
with their name and email **as they were at the moment of signing**, the exact
time, and their comment.

Three rules make it a record rather than a status field:

1. **A decision is final.** Rejected does not go back to pending: the site
   team puts the work right and raises a fresh request, so the history shows
   the rejection and the eventual approval as two separate events.
2. **A rejection says why.** "No" with nothing to act on only means a phone
   call to find out what was wrong.
3. **Nobody else can sign.** The portal route is the only write a client
   account can make, and it is the only route that can produce a signature.
   Staff get 403 on it.

The first two are enforced twice — in `lib/approvals.ts` and again by CHECK
constraints on the table — so a future route, a script, or a mistake in this
repo cannot write a signature that never happened. Revoking a client's access
removes their sight of the project without touching what they signed; the
name and email on the record are copies, not a join, for exactly that reason.

### How the restriction is enforced

A client is a member of the contractor's workspace, so the org filter that
protects every other role says yes to them. Three things narrow it:

1. **`project_access`** lists which projects a client account may see. The
   rows are written from the invitation when it is accepted — never from
   anything the person signing up sends.
2. **The SELECT policies** in `supabase/schema.sql` call `auth_is_client()`
   and `auth_client_project_ids()`. A client's reads are filtered to those
   project ids by Postgres, before any application code runs.
3. **`requireMember()` refuses a client by default.** Every internal route
   answers 403 unless it opts in with `{ allowClient: true }`, so a new route
   is closed to clients until someone decides otherwise rather than open until
   someone remembers.

Uploaded files are the one place where the org check was not enough: they live
one bucket per workspace with no project in the path, so `/api/uploads/...`
asks `clientMaySeeFile()` whether a record the client can *see* points at the
file. That lookup runs through their own session, so it is the same policy
doing the work rather than a second copy of the rule.

Two things are deliberately not open to a client, and both are one decision
away if you want them: the **document library** (one bucket per project with
no internal/shared distinction — a contract filed there would become visible)
and the **calendar**. Widening either means adding a per-item shared flag
first.

Changing a staff account into a client account, or the reverse, is refused:
the two are scoped differently, and converting one in place would leave an
account holding the wrong kind of scope. Invite them again instead. To take a
client's access away, deactivate the account on the Team page.

## The phone layout

Most of this app is read standing up, on a 5-inch screen, in a site office.
Two conventions carry that, and a new list page needs both.

Attendance is the sharpest case: it is taken standing in front of the line of
workers it lists, so below 700px each worker is a card with the
present/half-day/absent buttons at a size a thumb can hit.

**Rows become cards below 700px.** Put `className="cards"` on the `<table>`
and give every `<td>` a `data-label`; `app/globals.css` then turns each row
into a card whose cells carry their own labels and hides the header row. Two
cells opt out instead: `card-t` is the row's headline (a project name, a
machine) and renders first with no label, and `card-a` is the row's buttons
and renders last, left-aligned so the floating Create Report button is not
sitting on top of them. Nothing changes above 700px — the table, the sorting
and the row click are untouched — so this is safe to add to an existing page.

The reason it exists: a seven-column register on a 390px screen puts
"service overdue", "inspection expired", the severity and the status off the
right edge, behind a sideways scroll nobody performs. The columns that decide
what someone does next were the ones you could not see.

**Selectors must match what is rendered.** Six rules in `globals.css` styled
`.mobile-nav button` while `AppShell` rendered links, so the bottom
navigation was completely unstyled for twenty-one milestones — icons at
natural size, labels in link amber running off the edge, no active marker.
A selector matching nothing is not an error anywhere, and every browser test
ran at desktop width where that nav is `display: none`. `lib/mobileStyles.test.ts`
now pins the stylesheet to the markup, and `e2e/mobile.spec.ts` looks at the
result in a browser at phone width.

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

### Error alerting

Set one variable and errors stop being something you have to go looking for:

```
SENTRY_DSN="https://<key>@<org>.ingest.sentry.io/<projectId>"
```

Unset, the app logs to stdout as before and says so at boot
(`Error reporting disabled — SENTRY_DSN is not set`), plus a startup warning in
production. **Set but malformed is fatal** — the app refuses to boot. A typo
would otherwise leave you believing you had alerting while nothing reported and
nothing complained, and that belief is worse than knowing you have none.

What gets reported:

- Anything thrown while rendering a page, a Server Component or the proxy, via
  `onRequestError`.
- Every `reportError` call site, which is every handled server failure.
- Browser crashes caught by the three error boundaries, POSTed to
  `/api/client-errors`.

Each event carries the release (short commit SHA, read from whichever variable
your host sets — see `lib/release.ts`), so the first useful question about a
spike, *did this start with a deploy*, is answerable from the dashboard rather
than from memory.

**Not `@sentry/nextjs`, and deliberately.** That SDK wraps `next.config` with a
webpack plugin, injects a client bundle, and talks to `ingest.sentry.io` from
the browser — which would mean widening a CSP that is deliberately narrow
(`connect-src 'self'` plus Supabase, with a per-request nonce and
`strict-dynamic`). `lib/errorReporting.ts` speaks Sentry's envelope protocol
directly in about 200 dependency-free lines, and browser crashes POST to this
app's own endpoint, so the CSP is untouched and the DSN never reaches a public
bundle.

What that gives up, stated plainly: no breadcrumbs, no performance tracing, no
session replay, and no source-map symbolication — client stacks will name
minified frames. If you want those, `setErrorReporter` in `lib/logger.ts` is
the seam and swapping it is a three-line change:

```ts
import * as Sentry from "@sentry/nextjs";
setErrorReporter((err, context) => Sentry.captureException(err, { extra: context }));
```

**One trap worth knowing if you touch that seam.** The reporter is stored on
`globalThis`, not in a module variable, because Next bundles
`instrumentation.ts` into its own server chunk — each chunk gets its own copy
of `lib/logger`, so a module-scoped variable set by `register()` is invisible
to every route. The symptom is brutal: the boot log says
`Error reporting enabled`, every route dutifully calls `reportError`, and
nothing is ever sent. It only happens in a production build (dev shares the
module graph) and it fails silently. It was found by pointing a fake ingest
server at a real `npm run start` and getting no request, and
`lib/logger.test.ts` now reproduces it with `vi.resetModules()`.

Three properties the reporter holds to, each with a test:

- **It never throws.** A failure to report must not become a second error, or
  turn a handled 500 into an unhandled one.
- **It never blocks.** Fire-and-forget with a 5s timeout, so a slow ingest
  endpoint adds no latency to anybody's request.
- **It has a ceiling** of 30 events a minute. A hot loop throwing on every
  request would otherwise exhaust the quota and bury the one error that
  mattered.

Credentials are stripped from context before sending (`redact` — anything whose
key looks like a key, token, secret, password, authorization, cookie or dsn). An
error report travels to a third party and is retained by them, which makes it
the last place a service-role key should surface.

`/api/client-errors` is the only route in the app that an unauthenticated
stranger can write to, because the crashes most worth hearing about happen
before anything has loaded. It is rate-limited to 20/minute per IP, caps every
field, stores only the pathname (a query string here can carry an invite token),
and answers 204 to everything — including its own failures, since an error
reporter that reports its own errors is a loop.

Client reports are skipped when React attached a `digest`, which means the
server already caught and reported it. Without that rule every server-render
failure would be counted twice.

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

### After every deploy: `npm run smoke`

```bash
npm run smoke -- https://app.example.com
```

Answers the question a successful build does not: **is the thing that just
deployed actually serving the application, correctly configured, with its
defences on?** A build succeeds happily with a missing environment variable, a
reverse proxy that forgot to forward a header, or a container still running
last week's code.

Exits 0 if everything passes and 1 if anything fails, so it can gate a deploy.
An argument that is not a URL exits 2 — "you called this wrong" and "the deploy
is broken" are different answers and a pipeline should be able to tell them
apart. Nineteen checks in four groups:

- **Reachability** — `/api/health` returns ok *and* reports the database
  reachable, which doubles as proof the production Supabase credentials work.
- **Defences** — every security header from `next.config.ts`, `X-Powered-By`
  suppressed, and the CSP present with `strict-dynamic`, `object-src 'none'`,
  `frame-ancestors 'none'` and `base-uri 'self'`. The nonce is fetched twice
  and compared: a static nonce looks identical in a header dump and defends
  nothing. Over plain http the HSTS check is skipped rather than failed,
  because HSTS is inert there.
- **Routing** — `/login`, `/terms` and `/privacy` answer 200 signed out, and
  `/dashboard` redirects to sign-in. That last one is the most important check
  in the file: if the proxy is not running, every page in the app is open.
- **Build shape** — error pages leak no stack frames, filesystem paths or
  service-role references, and hashed static assets are served `immutable`.
  A development server passes a naive check and fails these.

It is dependency-free plain node (no `node_modules` required, so it runs in a
deploy pipeline), and `e2e/smoke-check.spec.ts` runs it against Playwright's
production build on every CI run — including a deliberate failure case, because
a smoke check that cannot fail is decoration.

Verified against a dev server while writing it: 15 passed, 4 failed —
`'unsafe-eval'` in the CSP, `node_modules` paths on both error pages, and
non-immutable assets. Those four are the difference between "it responds" and
"it is deployed".

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

Run `get_advisors` (or Supabase → Advisors) and expect exactly six findings,
each a decision rather than an oversight:

- **`rate_limits` has RLS enabled and no policies** (INFO). Deliberate
  deny-all. The table is reached only by the service role through
  `check_rate_limit()`, so there is no policy to write — a policy would be
  the thing that opened it up. Documented in a table comment; the linter
  still reports it, because a comment cannot clear a lint.
- **`deleted_workspaces` has RLS enabled and no policies** (INFO). The same
  deliberate deny-all, for a stronger reason: the organization a row
  describes no longer exists, so `auth_org_id()` could never match it and
  there is nobody left with a legitimate session claim to it. Operator
  record, service role only.
- **`auth_org_id()` is executable by `authenticated`** (WARN). Required, not
  an oversight: RLS policy expressions are evaluated with the *caller's*
  privileges, so revoking this grant would break every tenant-scoped read in
  the app. Calling it over RPC returns the caller's own org id — something
  they already know.
- **`auth_is_client()` and `auth_client_project_ids()` are executable by
  `authenticated`** (WARN, one each). The same case as `auth_org_id()` above,
  and for the same reason — they are what the SELECT policies call to narrow
  a client to their own projects, and a policy is evaluated as the caller.
  Over RPC they return whether the caller is a client and which project ids
  they may already read: their own answers, not anybody else's.
- **Leaked password protection is disabled** (WARN). This one is worth
  fixing and cannot be done from SQL. Turn it on at
  **Authentication → Policies → Password protection**; it checks new
  passwords against HaveIBeenPwned. Do this before real customers sign up.

### Legal pages, and the one thing you must do before launch

`/terms` and `/privacy` are public routes — not behind sign-in, deliberately.
The privacy notice has to be readable by someone whose IC number sits in a
customer's workspace and who has never heard of this product; redirecting them
to a sign-in form would defeat its purpose.

Both are **drafts**, and say so on the page. They were written from what the
software demonstrably does — every category of personal data in `/privacy` was
taken from `supabase/schema.sql`, and the plan prices in `/terms` are imported
from `lib/billing/plans.ts` rather than typed in, so they cannot drift from
what is charged. That makes them accurate about the software. It does not make
them legal advice.

Before you take money from a customer:

1. Fill in `OPERATOR` in `lib/legal.ts` — registered name, SSM number,
   address, and the privacy and support email addresses. `hostingRegion` is
   already correct (`ap-southeast-1`, Singapore).
2. Have a Malaysian advisor read both pages.
3. Set `REVIEWED = true` in `lib/legal.ts`. The draft banner disappears and
   `lib/legal.test.ts` starts failing on any placeholder left behind — so the
   flag cannot be true while the document is half-written.

**Note that the Supabase project is in Singapore, not Malaysia.** Every record
in this app therefore leaves the country, which PDPA restricts. `/privacy`
states it plainly rather than burying it, but it is a decision worth making on
purpose rather than by default.

Consent is recorded, not merely collected: `POST /api/orgs` and invite
acceptance both refuse without `acceptedTerms: true`, and both write a row to
`legal_acceptances` stamped with the server's `LEGAL_VERSION` — never a version
the client claims.

### The two tables with no foreign keys

`legal_acceptances` and `deleted_workspaces` are the only tables in this schema
that do not reference `organizations`, and in both cases that is the point
rather than an oversight: **a record that vanishes along with the thing it
describes is not a record.**

- **`legal_acceptances`** — evidence that an agreement was made. Cascading it
  away would delete exactly what you need if a former customer says they never
  agreed to anything. It stores the email beside the user id, because a bare
  uuid pointing at a deleted account proves nothing.
- **`deleted_workspaces`** — who deleted a workspace, when, on what plan, and
  how much was in it. `audit_log` is org-scoped and cascades, so the one event
  it can never hold is the organization's own deletion. Counts only: no worker
  names, no report text, no file names. RLS is on with **no policies at all** —
  service role only, because the organization is gone and `auth_org_id()` could
  never match. An e2e assertion pins the exact column list, so a future field
  carrying workspace content fails the build.

The deletion record is written **before** the delete runs. A record describing a
workspace that turns out to still exist is a discrepancy someone can notice and
resolve; a workspace gone with no record of who removed it is unrecoverable.

Three consequences worth knowing:

- Deleting an organization does **not** remove rows in either table. `e2e/seed.ts`
  and `e2e/export-and-delete.spec.ts` clean them up explicitly, and anything else
  that deletes orgs must do the same — a full e2e run left two acceptance rows in
  the live project before this was handled.
- Both retain personal data after a deletion request, so `/privacy` discloses
  both in as many words. Keeping them quietly would be the actual breach.
- There is no UI for either. They are operator records, not customer-facing
  features, and adding a screen would mean deciding who is entitled to read a
  record about a company that no longer exists.

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
