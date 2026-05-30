create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  pha_id text not null,
  ip text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_pha_id_attempted_at_idx
  on public.login_attempts (pha_id, attempted_at desc);

create index if not exists login_attempts_ip_attempted_at_idx
  on public.login_attempts (ip, attempted_at desc);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from anon, authenticated;
grant select, insert, delete on table public.login_attempts to service_role;
