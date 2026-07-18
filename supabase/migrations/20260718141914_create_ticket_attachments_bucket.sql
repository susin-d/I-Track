insert into storage.buckets (id, name, public, file_size_limit)
values ('ticket-attachments', 'ticket-attachments', false, 10000000)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;
