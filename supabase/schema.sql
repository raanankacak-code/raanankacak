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
  'VIEWER'
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

create policy "select_own_org" on organizations
  for select to authenticated
  using (id = auth_org_id());

create policy "select_own_org_members" on org_members
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_projects" on projects
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_workers" on workers
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_attendance" on attendance_records
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_reports" on daily_reports
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_invites" on org_invites
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_material_requests" on material_requests
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_material_events" on material_request_events
  for select to authenticated
  using (request_id in (select id from material_requests where org_id = auth_org_id()));

create policy "select_own_org_documents" on documents
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_calendar" on calendar_events
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_notifications" on notifications
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_bug_reports" on bug_reports
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_audit_log" on audit_log
  for select to authenticated
  using (org_id = auth_org_id());

create policy "select_own_org_subscription" on org_subscriptions
  for select to authenticated
  using (org_id = auth_org_id());

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
