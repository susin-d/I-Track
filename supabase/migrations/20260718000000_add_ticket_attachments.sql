create table if not exists ticket_attachments (
  id text primary key default gen_random_uuid()::text,
  organization text not null references organizations(id),
  ticket text not null references tickets(id) on delete cascade,
  name text not null,
  storage_key text not null unique,
  source_url text,
  mime_type text not null default 'application/octet-stream',
  size bigint not null default 0,
  uploaded_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_attachments_ticket_idx on ticket_attachments (organization, ticket, created_at desc);
alter table ticket_attachments enable row level security;
