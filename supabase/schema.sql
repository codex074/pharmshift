-- ============================================================
-- NTogether DB Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  pha_id          text unique,                  -- 'pha208' — permanent staff ID
  password        text default '1234',
  name            text not null,
  fullname        text,
  nickname        text,
  prefix          text,                         -- 'ภก.' or 'ภญ.'
  role            text not null default 'pharmacist',
  profile_image   text default 'male',         -- 'male' | 'female'
  must_change_password boolean default true,
  created_at      timestamptz default now()
);

-- Row Level Security
alter table public.users enable row level security;
create policy "Users can read all pharmacists" on public.users
  for select using (true);
create policy "Users can update own record" on public.users
  for update using (true);
create policy "Service role can insert users" on public.users
  for insert with check (true);

-- ── Departments ──────────────────────────────────────────────
create table if not exists public.departments (
  id    serial primary key,
  name  text unique not null
);

-- Insert departments
insert into public.departments (name) values
  ('โครงการ'),
  ('SURG'),
  ('MED'),
  ('ER'),
  ('SMC'),
  ('รุ่งอรุณ')
on conflict (name) do nothing;

-- ── Shifts ───────────────────────────────────────────────────
create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  department_id  integer references public.departments(id) on delete set null,
  shift_type     text not null check (shift_type in ('เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ')),
  position       text,                         -- 'OPD', 'ER', 'HIV', 'Cont', 'D/C'
  user_id        uuid references public.users(id) on delete cascade,
  month_year     text,                         -- 'YYYY-MM'
  created_at     timestamptz default now()
);

create index if not exists shifts_date_idx on public.shifts (date);
create index if not exists shifts_user_idx on public.shifts (user_id);
create index if not exists shifts_month_idx on public.shifts (month_year);

-- Row Level Security
alter table public.shifts enable row level security;
create policy "Authenticated users can read shifts" on public.shifts
  for select using (true);
create policy "Service role can insert shifts" on public.shifts
  for insert with check (true);
create policy "Admins and owners can update shifts" on public.shifts
  for update using (true);
create policy "Admins and owners can delete shifts" on public.shifts
  for delete using (true);

-- ── Swap Requests ────────────────────────────────────────────
create table if not exists public.swap_requests (
  id              uuid primary key default gen_random_uuid(),
  shift_id        uuid references public.shifts(id) on delete cascade,
  requester_id    uuid references public.users(id) on delete cascade,
  target_user_id  uuid references public.users(id) on delete cascade,
  request_type    text not null default 'transfer'
                  check (request_type in ('swap', 'transfer')),
  target_shift_id uuid references public.shifts(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected')),
  message         text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists swap_requests_target_idx on public.swap_requests (target_user_id);
create index if not exists swap_requests_status_idx on public.swap_requests (status);

-- Row Level Security
alter table public.swap_requests enable row level security;
create policy "Users can see swap requests involving them" on public.swap_requests
  for select using (true);
create policy "Users can create swap requests" on public.swap_requests
  for insert with check (true);
create policy "Target user can update (accept/reject)" on public.swap_requests
  for update using (true);
create policy "Allowed to delete swap requests" on public.swap_requests
  for delete using (true);

-- ── Auto-update updated_at ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger swap_requests_updated_at
  before update on public.swap_requests
  for each row execute procedure public.handle_updated_at();

-- ── Enable Realtime ──────────────────────────────────────────
-- Run in Supabase Dashboard → Database → Replication:
-- Select: shifts, swap_requests for realtime

-- Convenience view: shifts with user + dept info
create or replace view public.shifts_full as
  select
    s.id,
    s.date,
    s.shift_type,
    s.month_year,
    s.created_at,
    d.id   as department_id,
    d.name as department_name,
    u.id   as user_id,
    u.name as user_name,
    u.nickname as user_nickname,
    u.prefix as user_prefix,
    u.profile_image as user_profile_image
  from public.shifts s
  left join public.departments d on s.department_id = d.id
  left join public.users u on s.user_id = u.id;
