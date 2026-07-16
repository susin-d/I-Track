create extension if not exists pgcrypto;

create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  owner text,
  onboarding_completed_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null unique,
  password_hash text not null,
  last_active_organization text references organizations(id),
  avatar_color text not null default '#00AEEF',
  notification_preferences jsonb not null default '{"ticketAssignments":true,"mentionsAndComments":true,"sprintRiskAlerts":true,"weeklySummary":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table organizations add constraint organizations_owner_fk foreign key (owner) references users(id) not valid;
exception when duplicate_object then null;
end $$;
create table if not exists organization_memberships (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users(id),
  organization text not null references organizations(id),
  role text not null,
  status text not null default 'active',
  skills jsonb not null default '[]'::jsonb,
  availability numeric not null default 1,
  capacity numeric not null default 32,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, organization)
);

create table if not exists invitations (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id),
  email text not null,
  name text not null,
  role text not null,
  capacity numeric not null default 32,
  invited_by text not null references users(id),
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_by text references users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists invitations_email_status_idx on invitations (lower(email), status, expires_at);

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
  issue_links jsonb not null default '[]'::jsonb,
  comments jsonb not null default '[]'::jsonb, work_logs jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb, status_transitions jsonb not null default '[]'::jsonb,
  watchers jsonb not null default '[]'::jsonb, attachments jsonb not null default '[]'::jsonb,
  sla_policy jsonb not null default '{"firstResponseHours":8,"resolutionHours":72}'::jsonb,
  first_response_due_at timestamptz, resolution_due_at timestamptz, first_responded_at timestamptz,
  resolved_at timestamptz, sla_status text not null default 'healthy', rank numeric not null default 0,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, ticket_id)
);
alter table tickets add column if not exists issue_links jsonb not null default '[]'::jsonb;

create table if not exists workspace_resources (
  id text primary key default gen_random_uuid()::text, organization text not null references organizations(id),
  project text, kind text not null, name text not null, key text, description text not null default '',
  status text not null default 'active', ordering numeric not null default 0, config jsonb not null default '{}'::jsonb,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, kind, project, name)
);

create table if not exists sessions (
  id text primary key default gen_random_uuid()::text, user_id text not null, organization text,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, user_agent text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists action_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users(id), organization text references organizations(id),
  kind text not null, token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), user_id text not null references users(id),
  type text not null, title text not null, body text, entity_type text, entity_id text, read_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists integrations (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), kind text not null, name text not null,
  secret_hash text, url text, events jsonb not null default '[]'::jsonb, active boolean not null default true,
  last_used_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization, kind, name)
);

create table if not exists counters (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id), scope text not null, value bigint not null default 100,
  unique (organization, scope)
);

create table if not exists audit_events (
  id text primary key default gen_random_uuid()::text, organization text not null, actor text not null,
  action text not null, entity_type text, entity_id text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists tickets_org_status_idx on tickets (organization, status);
create index if not exists tickets_org_project_idx on tickets (organization, project);
create index if not exists tickets_org_sprint_idx on tickets (organization, sprint);
create index if not exists tickets_org_assignee_idx on tickets (organization, assignee);
create index if not exists projects_org_status_idx on projects (organization, status);
create index if not exists sprints_org_project_status_idx on sprints (organization, project, status);
create index if not exists cycles_org_start_idx on cycles (organization, start_date);
create index if not exists resources_org_kind_project_idx on workspace_resources (organization, kind, project);
create index if not exists audit_events_org_created_idx on audit_events (organization, created_at desc);
create index if not exists sessions_expires_idx on sessions (expires_at);
create index if not exists sessions_user_active_idx on sessions (user_id, revoked_at);
create index if not exists action_tokens_user_kind_idx on action_tokens (user_id, kind);
create index if not exists memberships_org_status_idx on organization_memberships (organization, status);
create index if not exists invitations_email_status_idx on invitations (lower(email), status, expires_at);
create index if not exists notifications_user_created_idx on notifications (organization, user_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations', 'users', 'organization_memberships', 'invitations', 'projects', 'sprints',
    'cycles', 'tickets', 'workspace_resources', 'sessions', 'action_tokens', 'notifications',
    'integrations', 'counters', 'audit_events'
  ] loop
    execute format('alter table %I enable row level security', table_name);
  end loop;
end $$;
