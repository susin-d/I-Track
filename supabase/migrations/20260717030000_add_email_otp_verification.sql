alter table users add column if not exists email_verified boolean not null default true;

alter table invitations add column if not exists otp_hash text;
alter table invitations add column if not exists otp_expires_at timestamptz;
alter table invitations add column if not exists otp_used_at timestamptz;

create index if not exists invitations_otp_hash_idx on invitations (otp_hash) where otp_hash is not null;
