alter table public.swap_requests
add column if not exists requester_read boolean not null default true;
