-- RUN THIS IN SUPABASE SQL EDITOR IF swap_requests.requester_read IS MISSING

alter table public.swap_requests
add column if not exists requester_read boolean not null default true;
