alter table tickets add column if not exists issue_type text not null default 'Task';
alter table tickets add column if not exists custom_fields jsonb not null default '{}'::jsonb;
