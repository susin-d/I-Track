create extension if not exists pgcrypto;

create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  owner text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null unique,
  password_hash text not null,
  organization text not null references organizations(id),
  role text not null,
  invite_status text not null default 'active',
  skills jsonb not null default '[]'::jsonb,
  availability numeric not null default 1,
  capacity numeric not null default 32,
  avatar_color text not null default '#00AEEF',
  notification_preferences jsonb not null default '{"ticketAssignments":true,"mentionsAndComments":true,"sprintRiskAlerts":true,"weeklySummary":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table organizations add constraint organizations_owner_fk foreign key (owner) references users(id) not valid;
create unique index if not exists users_org_email_idx on users (organization, lower(email));

create table if not exists projects (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), key text not null, name text not null,
  description text not null default '', status text not null, progress numeric not null default 0,
  risk_level text not null default 'low', active_sprint text, members jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, key)
);

create table if not exists sprints (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), name text not null,
  project text not null references projects(id), status text not null,
  start_date timestamptz not null, end_date timestamptz not null, capacity numeric not null default 0,
  planned_points numeric not null default 0, completed_points numeric not null default 0,
  velocity_history jsonb not null default '[]'::jsonb, risk_score numeric not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, project, name)
);

create table if not exists cycles (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), name text not null, goal text not null default '',
  status text not null default 'planned', start_date timestamptz not null, end_date timestamptz not null,
  sprints jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, name)
);

create table if not exists tickets (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), ticket_id text not null, title text not null,
  description text not null default '', acceptance_criteria jsonb not null default '[]'::jsonb,
  acceptance_criteria_done jsonb not null default '[]'::jsonb, status text not null, priority text not null,
  story_points numeric not null default 0, assignee text, reporter text not null, project text not null,
  sprint text, epic text not null default '', labels jsonb not null default '[]'::jsonb,
  due_date timestamptz, blocked boolean not null default false, dependencies jsonb not null default '[]'::jsonb,
  comments jsonb not null default '[]'::jsonb, work_logs jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb, status_transitions jsonb not null default '[]'::jsonb,
  watchers jsonb not null default '[]'::jsonb, attachments jsonb not null default '[]'::jsonb,
  sla_policy jsonb not null default '{"firstResponseHours":8,"resolutionHours":72}'::jsonb,
  first_response_due_at timestamptz, resolution_due_at timestamptz, first_responded_at timestamptz,
  resolved_at timestamptz, sla_status text not null default 'healthy', rank numeric not null default 0,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, ticket_id)
);

create table if not exists workspace_resources (
  id text primary key default gen_random_uuid()::text, organization text not null references organizations(id),
  project text, kind text not null, name text not null, key text, description text not null default '',
  status text not null default 'active', ordering numeric not null default 0, config jsonb not null default '{}'::jsonb,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, kind, project, name)
);

create table if not exists sessions (
  id text primary key default gen_random_uuid()::text, user_id text not null, organization text not null,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, user_agent text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key default gen_random_uuid()::text, organization text not null, actor text not null,
  action text not null, entity_type text, entity_id text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists tickets_org_status_idx on tickets (organization, status);
create index if not exists audit_events_org_created_idx on audit_events (organization, created_at desc);
create index if not exists sessions_expires_idx on sessions (expires_at);
