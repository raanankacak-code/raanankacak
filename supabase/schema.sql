-- BinaWorks — Phase 1 schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Every tenant-scoped READ in the app goes through a session-bound client
-- (anon key + the caller's JWT), so the per-org SELECT policies in the
-- "RLS enforcement" section near the end of this file are load-bearing, not
-- just a backstop: a query that lost its org_id filter would still only ever
-- return the caller's own org's rows.
--
-- WRITES use the service-role key, which bypasses RLS, so the app's own
-- checks in lib/auth.ts and lib/permissions.ts are what gate those. There
-- are deliberately no INSERT/UPDATE/DELETE policies.

create type role as enum (
  'OWNER',
  'ADMIN',
  'PROJECT_MANAGER',
  'SITE_SUPERVISOR',
  'ENGINEER',
  'QUANTITY_SURVEYOR',
  'SAFETY_OFFICER',
  'STOREKEEPER',
  'FINANCE',
  'VIEWER',
  -- The client's own login. Separate from VIEWER on purpose: a Viewer is a
  -- member of staff who reads every project, and a client must read exactly
  -- the ones listed for them in project_access. That difference is enforced
  -- by the SELECT policies at the end of this file, not only in app code.
  'CLIENT'
);

create type project_status as enum (
  'PLANNING',
  'ACTIVE',
  'COMPLETED',
  'ON_HOLD'
);

create type attendance_status as enum (
  'PRESENT',
  'HALF_DAY',
  'ABSENT'
);

create type report_status as enum (
  'SUBMITTED',
  'REVIEWED'
);

-- search_path is pinned, as it is on every other function here. A trigger
-- function without it resolves unqualified names against whatever search_path
-- the *calling* session happens to have, which is the standard way a
-- privileged function gets pointed at an attacker's table.
create function set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- organizations --------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  ssm_number text,
  cidb_number text,
  email text,
  phone text,
  website text,
  description text,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  state text,
  country text not null default 'Malaysia',
  currency text not null default 'MYR',
  timezone text not null default 'Asia/Kuching',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

alter table organizations enable row level security;

-- org_members ------------------------------------------------------------
-- user_id references the Supabase-authenticated user (auth.users.id).

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index org_members_user_id_idx on org_members (user_id);

create trigger org_members_set_updated_at
  before update on org_members
  for each row execute function set_updated_at();

alter table org_members enable row level security;

-- projects ---------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  client text,
  site_address text,
  contract_value numeric(14, 2),
  start_date date,
  end_date date,
  status project_status not null default 'PLANNING',
  progress_pct integer not null default 0,
  planned_pct integer not null default 0,
  manager_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_org_id_idx on projects (org_id);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;

-- project_access -----------------------------------------------------------
-- Which projects a CLIENT account may see. Staff are not listed here; they
-- are scoped by org alone. org_id is denormalised, as on every other business
-- table, so the tenant filter never depends on a join being right.

create table project_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  member_id uuid not null references org_members(id) on delete cascade,
  granted_by_name text,
  created_at timestamptz not null default now(),
  unique (project_id, member_id)
);

create index project_access_member_id_idx on project_access (member_id);
create index project_access_org_id_idx on project_access (org_id);

alter table project_access enable row level security;

-- workers ------------------------------------------------------------------
-- Site labourers, not Supabase-authenticated users.

create table workers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  trade text,
  daily_rate numeric(10, 2),
  ic_number text,
  cidb_number text,
  cidb_expiry date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workers_project_id_idx on workers (project_id);
create index workers_org_id_idx on workers (org_id);

create trigger workers_set_updated_at
  before update on workers
  for each row execute function set_updated_at();

alter table workers enable row level security;

-- attendance_records ---------------------------------------------------

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  date date not null,
  status attendance_status not null,
  time_in text,
  time_out text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, date)
);

create index attendance_records_project_date_idx on attendance_records (project_id, date);
create index attendance_records_org_id_idx on attendance_records (org_id);

create trigger attendance_records_set_updated_at
  before update on attendance_records
  for each row execute function set_updated_at();

alter table attendance_records enable row level security;

-- daily_reports ------------------------------------------------------------

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  weather text,
  manpower jsonb,
  work_completed text,
  delays text,
  notes text,
  photos jsonb,
  status report_status not null default 'SUBMITTED',
  submitted_by_id uuid not null,
  submitted_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_reports_project_date_idx on daily_reports (project_id, date);
create index daily_reports_org_id_idx on daily_reports (org_id);

create trigger daily_reports_set_updated_at
  before update on daily_reports
  for each row execute function set_updated_at();

alter table daily_reports enable row level security;

-- ===========================================================================
-- Phase 2 — team invites, materials, documents, calendar, notifications
-- ===========================================================================

create type invite_status as enum (
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'CANCELLED'
);

create type material_request_status as enum (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'DELIVERED'
);

create type calendar_event_type as enum (
  'DEADLINE',
  'DELIVERY',
  'INSPECTION',
  'MEETING',
  'LEAVE',
  'HOLIDAY'
);

create type calendar_event_priority as enum (
  'LOW',
  'MEDIUM',
  'HIGH'
);

create type calendar_event_status as enum (
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED'
);

-- org_invites --------------------------------------------------------------

create table org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  token text not null unique,
  name text not null,
  email text not null,
  role role not null,
  phone text,
  department text,
  project_ids uuid[] not null default '{}',
  status invite_status not null default 'PENDING',
  invited_by_name text not null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index org_invites_org_id_idx on org_invites (org_id);

create trigger org_invites_set_updated_at
  before update on org_invites
  for each row execute function set_updated_at();

alter table org_invites enable row level security;

-- material_requests ----------------------------------------------------------

create table material_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  material text not null,
  qty numeric(12, 2) not null,
  unit text not null,
  needed_by date,
  justification text,
  status material_request_status not null default 'SUBMITTED',
  received_qty numeric(12, 2),
  requested_by_id uuid not null,
  requested_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index material_requests_project_id_idx on material_requests (project_id);
create index material_requests_org_id_idx on material_requests (org_id);

create trigger material_requests_set_updated_at
  before update on material_requests
  for each row execute function set_updated_at();

alter table material_requests enable row level security;

-- material_request_events (approval timeline) ---------------------------------

create table material_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references material_requests(id) on delete cascade,
  state material_request_status not null,
  comment text,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index material_request_events_request_id_idx on material_request_events (request_id);

alter table material_request_events enable row level security;

-- documents ------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  folder text not null default 'Other',
  name text not null,
  url text not null,
  size_bytes bigint not null,
  mime_type text,
  uploaded_by_id uuid not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);

create index documents_project_id_idx on documents (project_id);
create index documents_org_id_idx on documents (org_id);

alter table documents enable row level security;

-- calendar_events --------------------------------------------------------------

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  type calendar_event_type not null,
  title text not null,
  date date not null,
  time text,
  end_time text,
  priority calendar_event_priority not null default 'MEDIUM',
  status calendar_event_status not null default 'SCHEDULED',
  location text,
  with_who text,
  description text,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_events_org_id_date_idx on calendar_events (org_id, date);
create index calendar_events_project_id_idx on calendar_events (project_id);

create trigger calendar_events_set_updated_at
  before update on calendar_events
  for each row execute function set_updated_at();

alter table calendar_events enable row level security;

-- notifications ------------------------------------------------------------------
-- Org-wide feed (shared read state), matching the design prototype.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_org_id_created_idx on notifications (org_id, created_at desc);

alter table notifications enable row level security;

-- bug reports -----------------------------------------------------------

create table bug_reports (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  org_id uuid not null references organizations(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id) on delete cascade,
  reported_by_name text not null,
  reported_by_email text not null,
  area text not null,
  severity text not null,
  description text not null,
  steps text,
  status text not null default 'OPEN',
  created_at timestamptz not null default now()
);

create index bug_reports_org_id_created_idx on bug_reports (org_id, created_at desc);

alter table bug_reports enable row level security;

-- audit log --------------------------------------------------------------
-- Append-only compliance trail for financial edits, approvals and
-- membership/role changes. The triggers below block UPDATE and DELETE
-- unconditionally, including for the service-role key the app uses for
-- everything else, so this table stays tamper-evident even if application
-- code has a bug — there is intentionally no update/delete path at all.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_member_id uuid references org_members(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_id_created_idx on audit_log (org_id, created_at desc);

alter table audit_log enable row level security;

create function audit_log_deny_mutation() returns trigger as $$
begin
  -- Block direct/standalone mutation (depth = 1), but allow deletes that
  -- cascade from an organizations row being deleted (depth > 1) — otherwise
  -- an org can never be deleted once it has any audit history.
  if pg_trigger_depth() = 1 then
    raise exception 'audit_log is append-only: % is not permitted', tg_op;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql set search_path = '';

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function audit_log_deny_mutation();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function audit_log_deny_mutation();

-- subscriptions ----------------------------------------------------------
-- One subscription row per organization. Rows are created lazily on first
-- read (existing orgs get a fresh trial), so no backfill is needed.

create table org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  plan text not null default 'PROFESSIONAL',
  status text not null default 'TRIALING',
  trial_ends_at timestamptz not null,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_subscriptions_plan_check check (plan in ('STARTER', 'PROFESSIONAL', 'BUSINESS')),
  constraint org_subscriptions_status_check check (status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED'))
);

create unique index org_subscriptions_stripe_subscription_id_idx
  on org_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table org_subscriptions enable row level security;

create trigger org_subscriptions_set_updated_at
  before update on org_subscriptions
  for each row execute function set_updated_at();


-- rate_limits ----------------------------------------------------------------
-- Shared rate-limit buckets. Kept in Postgres rather than process memory so
-- every instance enforces one budget: with in-memory buckets, N replicas
-- meant roughly N times the intended limit and a restart forgot everything,
-- which made the limits decorative in any multi-instance deployment.

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

create index rate_limits_window_start_idx on rate_limits (window_start);

alter table rate_limits enable row level security;

-- Decides and counts in one statement. Splitting the check from the
-- increment would let two concurrent requests both read count = limit - 1
-- and both proceed, which is exactly the race a shared store must close.
create function check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set
      window_start = case
        when rl.window_start + make_interval(secs => p_window_ms / 1000.0) <= v_now
          then v_now
        else rl.window_start
      end,
      count = case
        when rl.window_start + make_interval(secs => p_window_ms / 1000.0) <= v_now
          then 1
        else rl.count + 1
      end
  returning rl.window_start, rl.count into v_window_start, v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    case
      when v_count <= p_limit then 0
      else greatest(
        0,
        ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_ms / 1000.0)) - v_now))::integer
      )
    end;
end;
$$;

revoke execute on function check_rate_limit(text, integer, integer) from public;
revoke execute on function check_rate_limit(text, integer, integer) from anon;
revoke execute on function check_rate_limit(text, integer, integer) from authenticated;

-- Sweeps buckets whose window closed long ago, so the table stays small.
create function prune_rate_limits(p_older_than_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - make_interval(hours => p_older_than_hours);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function prune_rate_limits(integer) from public;
revoke execute on function prune_rate_limits(integer) from anon;
revoke execute on function prune_rate_limits(integer) from authenticated;

-- RLS enforcement ----------------------------------------------------------
-- Real policies, as a defense-in-depth backstop behind the app's own org_id
-- filtering. Every tenant-scoped *read* in the app now goes through the
-- session-bound client (anon key + the caller's JWT), so these policies are
-- load-bearing today, not just a future safety net: a bug that dropped an
-- .eq("org_id", ...) filter from a read would still only ever return the
-- caller's own org's rows.
--
-- Writes (and the few reads that legitimately have no user session — the
-- Stripe webhook, invite-token lookup during signup, lazy trial creation on
-- first access) still use the service-role key, which bypasses RLS. There
-- are deliberately no INSERT/UPDATE/DELETE policies: mutations are guarded
-- by the app's own permission checks in lib/permissions.ts + lib/auth.ts.
--
-- auth_org_id() is SECURITY DEFINER so it can read org_members to resolve
-- the caller's org without recursing into org_members' own RLS policy.
-- EXECUTE is revoked from anon/PUBLIC — Supabase grants new public-schema
-- functions to anon/authenticated by default, and this function has no
-- legitimate direct-call use case (only RLS policy evaluation needs it).

create function auth_org_id() returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select org_id from public.org_members where user_id = auth.uid() and active = true limit 1;
$$;

revoke execute on function auth_org_id() from public;
revoke execute on function auth_org_id() from anon;
grant execute on function auth_org_id() to authenticated;

-- The client scope.
--
-- A CLIENT is inside the org like anybody else, so org_id alone would show
-- them every project the contractor runs. These two functions are what
-- narrows that to the projects listed for them in project_access. Both are
-- SECURITY DEFINER for the same reason auth_org_id() is: they read
-- org_members, whose own policy would otherwise recurse.
--
-- The role is compared as text rather than as the enum literal so that the
-- migration adding 'CLIENT' and the migration creating these functions can
-- be separate statements — Postgres refuses to use a new enum value in the
-- same transaction that added it.

create function auth_is_client() returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select role::text = 'CLIENT' from public.org_members
      where user_id = auth.uid() and active = true limit 1),
    false
  );
$$;

create function auth_client_project_ids() returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select pa.project_id
    from public.project_access pa
    join public.org_members m on m.id = pa.member_id
   where m.user_id = auth.uid() and m.active = true;
$$;

revoke execute on function auth_is_client() from public, anon;
revoke execute on function auth_client_project_ids() from public, anon;
grant execute on function auth_is_client() to authenticated;
grant execute on function auth_client_project_ids() to authenticated;

-- Every policy below keeps its org filter and adds a clause that only
-- engages for a client, so no existing role's access changes.
-- `(select auth_is_client())` is wrapped in a scalar subquery deliberately:
-- that makes Postgres evaluate it once per query as an InitPlan instead of
-- once per row.

-- The client's own contractor: the portal shows the company's name and logo.
create policy "select_own_org" on organizations
  for select to authenticated
  using (id = auth_org_id());

-- Their own membership row so the portal can greet them by name — not the
-- rest of the contractor's staff list.
create policy "select_own_org_members" on org_members
  for select to authenticated
  using (
    org_id = auth_org_id()
    and ((select auth_is_client()) = false or user_id = auth.uid())
  );

create policy "select_own_project_access" on project_access
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      (select auth_is_client()) = false
      or member_id in (select id from org_members where user_id = auth.uid())
    )
  );

-- What a client can see, scoped to their own projects: the project itself,
-- the site diary, the safety record and the snag list.
create policy "select_own_org_projects" on projects
  for select to authenticated
  using (
    org_id = auth_org_id()
    and ((select auth_is_client()) = false or id in (select auth_client_project_ids()))
  );

create policy "select_own_org_reports" on daily_reports
  for select to authenticated
  using (
    org_id = auth_org_id()
    and ((select auth_is_client()) = false or project_id in (select auth_client_project_ids()))
  );

-- Everything else is staff-only: commercial data (materials and costs),
-- other people's personal data (workers and their attendance), the plant
-- register, the internal calendar, the audit log, invitations, billing and
-- the document library — a document library is one bucket per project with
-- no internal/shared distinction, so opening it would hand a client whatever
-- happens to have been filed there.
create policy "select_own_org_workers" on workers
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_attendance" on attendance_records
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_invites" on org_invites
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_material_requests" on material_requests
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_material_events" on material_request_events
  for select to authenticated
  using (
    (select auth_is_client()) = false
    and request_id in (select id from material_requests where org_id = auth_org_id())
  );

create policy "select_own_org_documents" on documents
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_calendar" on calendar_events
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_notifications" on notifications
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_bug_reports" on bug_reports
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_audit_log" on audit_log
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

create policy "select_own_org_subscription" on org_subscriptions
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

-- rls safety net ---------------------------------------------------------
-- Enables row level security on any table created in `public`, so a new
-- table cannot be added without it. This lived only in the live database
-- until now: it was applied directly and never written down, which meant
-- rebuilding from this file would have produced a database that looked
-- right and had lost the guardrail. Restoring the schema and restoring the
-- protections have to be the same operation.
--
-- The function is SECURITY DEFINER because enabling RLS needs table
-- ownership, and EXECUTE is revoked from every client role: it returns
-- event_trigger and errors outside a trigger context, but there is no reason
-- for it to be reachable over PostgREST at all.

create function rls_auto_enable() returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skipped % (schema %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

revoke execute on function rls_auto_enable() from public;
revoke execute on function rls_auto_enable() from anon;
revoke execute on function rls_auto_enable() from authenticated;

create event trigger ensure_rls
  on ddl_command_end
  execute function rls_auto_enable();

-- scheduled maintenance --------------------------------------------------
-- Rate-limit buckets keyed by IP accumulate one row per distinct address
-- that has ever hit a limited endpoint, so the table grows without bound
-- unless something sweeps it. 03:17 rather than 03:00, to sit outside the
-- crowd of jobs everyone schedules on the hour.

create extension if not exists pg_cron;

select cron.schedule('prune-rate-limits', '17 3 * * *', $$select public.prune_rate_limits(24)$$);

comment on table rate_limits is
  'Deny-all by design: RLS enabled with no policies. Reached only by the service role through check_rate_limit().';

-- safety inspections -----------------------------------------------------
-- Site safety records. Compliance is the thing a contractor is buying here,
-- so an inspection is a dated, attributed record with evidence attached —
-- not a checkbox someone can quietly revise later.

create type safety_inspection_outcome as enum ('PASS', 'ACTIONS_REQUIRED', 'FAIL');
create type safety_inspection_status as enum ('OPEN', 'CLOSED');

create table safety_inspections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  date date not null,
  inspector_id uuid not null,
  inspector_name text not null,
  outcome safety_inspection_outcome not null,
  status safety_inspection_status not null default 'OPEN',
  -- The checklist as filled in: [{category, item, result, note}]. jsonb rather
  -- than a child table for the same reason daily_reports stores manpower that
  -- way: it is written once with the inspection and always read whole.
  items jsonb not null default '[]'::jsonb,
  -- Denormalised so "which sites are failing" is a count, not a jsonb scan
  -- over every inspection in the workspace.
  failed_count integer not null default 0,
  notes text,
  photos jsonb,
  closed_at timestamptz,
  closed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index safety_inspections_project_id_idx on safety_inspections (project_id);
create index safety_inspections_org_id_idx on safety_inspections (org_id);
-- Serves the open-actions badge and the list's default ordering.
create index safety_inspections_org_status_date_idx
  on safety_inspections (org_id, status, date desc);

create trigger safety_inspections_set_updated_at
  before update on safety_inspections
  for each row execute function set_updated_at();

alter table safety_inspections enable row level security;

create policy "select_own_org_safety_inspections" on safety_inspections
  for select to authenticated
  using (
    org_id = auth_org_id()
    and ((select auth_is_client()) = false or project_id in (select auth_client_project_ids()))
  );

-- legal acceptances -------------------------------------------------------
-- Who accepted the terms and privacy notice, at which version, and when.
--
-- The one table here with NO foreign keys, and that is the point rather than
-- an oversight. An acceptance is evidence that an agreement was made.
-- Cascading it away with the organization (or with the auth user) would
-- delete precisely the record needed if a former customer later says they
-- never agreed to anything. Rows are immutable: no update path and no
-- updated_at trigger, because a historical fact does not change.
--
-- email is stored beside user_id for the same reason. Without a foreign key
-- the uuid can point at an account that no longer exists, and "some uuid
-- agreed to v2026-07-29" is not evidence of anything.
--
-- Retaining this after a workspace is deleted is disclosed in app/privacy —
-- keeping personal data past a deletion request without saying so is the
-- kind of thing PDPA exists to stop.

create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  email text not null,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (org_id, user_id, document, version)
);

create index legal_acceptances_org_idx on legal_acceptances (org_id);

alter table legal_acceptances enable row level security;

-- Members read their own organization's acceptances; an Owner needs to be
-- able to answer "who agreed to what". There is deliberately no insert,
-- update or delete policy, so the session client cannot write here under any
-- role — rows are created by the server with the service key at signup and
-- at invite acceptance, and nothing can forge or amend one afterwards.
create policy legal_acceptances_select on legal_acceptances
  for select using (org_id = auth_org_id() and (select auth_is_client()) = false);

-- deleted workspaces ------------------------------------------------------
-- What was deleted, by whom, when, and how much of it there was.
--
-- audit_log is org-scoped and cascades with the organization, so the one
-- event it can never record is the organization's own deletion: the moment
-- that row goes, so does every trace of who removed it. This table is the
-- answer, and like legal_acceptances it deliberately has no foreign keys — a
-- record that vanishes along with the thing it describes is not a record.
--
-- The counts are taken immediately before the delete runs, and the row is
-- written before it too. A record describing a workspace that turns out to
-- still exist is a discrepancy someone can notice and resolve; a workspace
-- that is gone with no record of who removed it is unrecoverable.
--
-- Counts only: no worker names, no report text, no file names. Retaining
-- this after a deletion request is disclosed in app/privacy.

create table deleted_workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique,
  org_name text not null,
  deleted_by_user_id uuid not null,
  deleted_by_email text not null,
  deleted_by_name text not null,
  deleted_at timestamptz not null default now(),
  plan text,
  member_count integer not null default 0,
  project_count integer not null default 0,
  worker_count integer not null default 0,
  report_count integer not null default 0,
  storage_object_count integer not null default 0,
  storage_bytes bigint not null default 0
);

alter table deleted_workspaces enable row level security;

-- No policies at all: deny-all for anything holding a user session, service
-- role only. This is not an omission. The organization is gone, so
-- auth_org_id() could never match these rows anyway — there is nobody left
-- with a legitimate session claim to them. The same deliberate deny-all as
-- rate_limits, and it shows up in Supabase's advisors the same way.

-- defects -----------------------------------------------------------------
-- Snag lists. A defect is raised against a place on a project, assigned to
-- someone, and closed by someone else once the evidence says it is fixed.
--
-- Two sets of photos rather than one, and that is the point of the table:
-- what was wrong, and what it looks like now. A snag list with only "closed"
-- against it is a claim; a snag list with a before and an after is a record.

create type defect_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type defect_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

create table defects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  title text not null,
  -- Free text on purpose. Every contractor describes a location differently
  -- ("Blk A L3 U12", "north stair core"), and a structured hierarchy would
  -- be wrong for most of them and unfillable on a phone for the rest.
  location text,
  description text,
  severity defect_severity not null default 'MEDIUM',
  status defect_status not null default 'OPEN',
  raised_by_id uuid not null,
  raised_by_name text not null,
  -- Names are denormalised beside the ids for the same reason the audit log
  -- does it: a defect raised two years ago should still say who raised it
  -- after that person has left and their membership row is gone.
  assigned_to_id uuid,
  assigned_to_name text,
  due_date date,
  photos jsonb,
  resolution_notes text,
  resolution_photos jsonb,
  closed_at timestamptz,
  closed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index defects_project_id_idx on defects (project_id);
create index defects_org_id_idx on defects (org_id);
-- Serves the overdue badge and the list's default ordering (soonest due
-- first), which is the question a site manager actually asks.
create index defects_org_status_due_idx on defects (org_id, status, due_date);
-- "What is assigned to me" without scanning the workspace.
create index defects_assigned_to_idx on defects (assigned_to_id) where assigned_to_id is not null;

create trigger defects_set_updated_at
  before update on defects
  for each row execute function set_updated_at();

alter table defects enable row level security;

create policy "select_own_org_defects" on defects
  for select to authenticated
  using (
    org_id = auth_org_id()
    and ((select auth_is_client()) = false or project_id in (select auth_client_project_ids()))
  );

-- equipment ---------------------------------------------------------------
-- The plant register: what you own or hire, where it is, and when it is next
-- due for service or statutory inspection.
--
-- project_id is nullable with ON DELETE SET NULL rather than CASCADE. A
-- machine outlives the job it was on; deleting a project must release it back
-- to the yard, not destroy the equipment register along with the site.

create type equipment_status as enum ('ACTIVE', 'MAINTENANCE', 'IDLE', 'RETIRED');

create table equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  code text not null,
  name text not null,
  type text,
  registration_no text,
  -- Owned plant is serviced on hours; hired plant is invoiced on them. The
  -- flag is what decides which question the hours answer.
  owned boolean not null default true,
  supplier text,
  status equipment_status not null default 'ACTIVE',
  last_service_date date,
  next_service_date date,
  -- Statutory inspection (DOSH for lifting gear, pressure vessels and the
  -- like). Expiring is not a maintenance inconvenience — it is a machine
  -- that must stop, which is why it is its own column and not a note.
  inspection_expiry date,
  notes text,
  photos jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index equipment_org_id_idx on equipment (org_id);
create index equipment_project_id_idx on equipment (project_id);
create index equipment_org_service_idx on equipment (org_id, next_service_date);
create index equipment_org_inspection_idx on equipment (org_id, inspection_expiry);

create trigger equipment_set_updated_at
  before update on equipment
  for each row execute function set_updated_at();

alter table equipment enable row level security;

create policy "select_own_org_equipment" on equipment
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

-- One row per machine per day worked. Kept as rows rather than a running
-- total on the equipment row, so a correction is visible rather than
-- overwriting a number nobody can audit.
create table equipment_usage_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  date date not null,
  hours numeric(6, 1) not null check (hours >= 0 and hours <= 24),
  operator_name text,
  notes text,
  logged_by_id uuid not null,
  logged_by_name text not null,
  created_at timestamptz not null default now()
);

create index equipment_usage_logs_equipment_idx on equipment_usage_logs (equipment_id, date desc);
create index equipment_usage_logs_org_idx on equipment_usage_logs (org_id);

alter table equipment_usage_logs enable row level security;

create policy "select_own_org_equipment_usage_logs" on equipment_usage_logs
  for select to authenticated
  using (org_id = auth_org_id() and (select auth_is_client()) = false);

-- Totals computed from the logs, never stored beside them. A denormalised
-- total drifts the first time a log is corrected, and the drift is silent.
-- security_invoker keeps the view subject to the caller's RLS rather than the
-- view owner's, so it cannot become a way around tenant separation.
create view equipment_hours with (security_invoker = on) as
  select
    equipment_id,
    sum(hours) as total_hours,
    max(date) as last_used,
    count(*) as log_count
  from equipment_usage_logs
  group by equipment_id;
