-- BinaWorks — Phase 1 schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Mirrors prisma/schema.prisma. All access from the app goes through the
-- Next.js API routes using the service-role key, so RLS is enabled with no
-- public policies (deny-by-default for anon/authenticated; service_role
-- bypasses RLS entirely).

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

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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
