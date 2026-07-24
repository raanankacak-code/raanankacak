# BinaWorks

Construction & contractor site management for Sarawak-based contractors — daily
reports, attendance, and project tracking, scoped per-company with role-based
access.

This started as a static HTML/CSS/JS design prototype and is being rebuilt as
a real Next.js app with a Postgres (Supabase) database and Supabase Auth.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Supabase** — Postgres database + Auth (email/password)
- **supabase-js** (service-role client, server-only) — all data access; no ORM
- Plain CSS design system ported from the original prototype (no Tailwind)
- Local-disk file storage for uploaded photos/logos (Phase 1 — see below)

## Phase 1 scope

The current build covers the core daily-use loop end to end:

- Sign up (creates a company workspace, you become Owner) / sign in
- Multi-tenant orgs with role-based permissions (`lib/permissions.ts`)
- Projects — create/edit/delete, worker roster per project
- Daily reports — weather, manpower by trade, work completed, site photos
- Attendance — daily check-in grid (Present/Half/Absent), CIDB Green Card
  expiry flags

Not yet built (from the original design): materials/procurement, calendar,
team invitations UI, company settings UI, notifications, global search, help
center. The data model and permission system are already set up to extend
into these.

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
indexes the app expects, with RLS enabled and no public policies — all data
access goes through the server-only service-role client (`lib/supabase/admin.ts`),
which bypasses RLS, so the app's own auth/permission checks in `lib/auth.ts`
and `lib/permissions.ts` are what actually gate access.

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

`npm run test:e2e` needs a real (test) Supabase project — it seeds a
throwaway org/owner user directly via the service-role key, runs the
golden-path spec against a production build (`npm run build && npm run start`,
via Playwright's `webServer`), then deletes the seeded org/user. Set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` in `.env` (loaded automatically by
`playwright.config.ts` via `process.loadEnvFile()`) — **use a test project,
not production**, since the
suite creates and deletes real rows. In CI (`.github/workflows/ci.yml`), the
same three values must be set as repository secrets; the `e2e` job skips
itself with a warning if they're missing.

## File uploads

Daily report photos are stored on local disk under `UPLOADS_DIR` (default
`./uploads`, gitignored) and served back through `app/api/uploads/[...path]`,
scoped per-org. This requires a **persistent, writable filesystem** — it
works on a self-hosted Node server, VM, or container with a mounted volume,
but **will not persist on ephemeral/serverless hosts like Vercel**. Swap for
S3-compatible storage (e.g. Supabase Storage) later if you deploy serverless.

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
