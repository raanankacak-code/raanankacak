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
