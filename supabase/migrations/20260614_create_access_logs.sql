-- Daily-active access log.
-- Because sessions now persist ~400 days, the `login` audit event rarely
-- fires, so it no longer reflects who actually uses the app. This table
-- records one row per user per (Bangkok) day instead — written when a user
-- opens the app (GET /api/auth/me).

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  hit_count integer not null default 1,
  unique (user_id, day)
);

create index if not exists access_logs_day_idx
  on public.access_logs (day desc);

create index if not exists access_logs_user_day_idx
  on public.access_logs (user_id, day desc);

-- Atomic upsert: insert the first hit of the day, otherwise bump
-- last_seen_at + hit_count without touching first_seen_at.
create or replace function public.record_access(p_user_id uuid, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.access_logs (user_id, day)
  values (p_user_id, p_day)
  on conflict (user_id, day)
  do update set
    last_seen_at = now(),
    hit_count = public.access_logs.hit_count + 1;
$$;

alter table public.access_logs enable row level security;
revoke all on table public.access_logs from anon, authenticated;
grant select, insert, update, delete on table public.access_logs to service_role;
revoke all on function public.record_access(uuid, date) from anon, authenticated;
grant execute on function public.record_access(uuid, date) to service_role;
