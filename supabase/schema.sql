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
  prefix          text,                         -- 'ภก.' or 'ภญ.'
  f_name          text not null default '',     -- ชื่อ
  l_name          text not null default '',     -- นามสกุล
  nickname        text,
  role            text not null default 'pharmacist',
  profile_image   text default 'male',         -- 'male' | 'female'
  must_change_password boolean default true,
  salary_number   text,                         -- เลขที่รับเงินเดือน
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
                  check (request_type in ('swap', 'transfer', 'cover')),
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

create or replace function public.accept_swap_request_atomic(
  p_swap_id uuid,
  p_actor_user_id uuid
)
returns table (
  ok boolean,
  error_code text,
  auto_rejected_ids uuid[]
)
language plpgsql
as $$
declare
  v_req public.swap_requests%rowtype;
  v_shift_owner uuid;
  v_target_shift_owner uuid;
  v_new_user_id uuid;
  v_shift_ids uuid[];
  v_auto_rejected_ids uuid[];
begin
  select *
  into v_req
  from public.swap_requests
  where id = p_swap_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND', array[]::uuid[];
    return;
  end if;

  if v_req.target_user_id <> p_actor_user_id then
    return query select false, 'FORBIDDEN', array[]::uuid[];
    return;
  end if;

  if v_req.status <> 'pending' then
    return query select false, 'ALREADY_PROCESSED', array[]::uuid[];
    return;
  end if;

  select user_id
  into v_shift_owner
  from public.shifts
  where id = v_req.shift_id
  for update;

  if not found then
    return query select false, 'SHIFT_NOT_FOUND', array[]::uuid[];
    return;
  end if;

  if v_req.request_type = 'swap' then
    select user_id
    into v_target_shift_owner
    from public.shifts
    where id = v_req.target_shift_id
    for update;

    if not found then
      return query select false, 'TARGET_SHIFT_NOT_FOUND', array[]::uuid[];
      return;
    end if;

    if v_shift_owner <> v_req.target_user_id or v_target_shift_owner <> v_req.requester_id then
      return query select false, 'SHIFT_OWNERSHIP_CHANGED', array[]::uuid[];
      return;
    end if;

    update public.shifts
    set user_id = v_req.requester_id
    where id = v_req.shift_id;

    update public.shifts
    set user_id = v_req.target_user_id
    where id = v_req.target_shift_id;

    v_shift_ids := array[v_req.shift_id, v_req.target_shift_id];
  else
    if v_shift_owner = v_req.requester_id then
      v_new_user_id := v_req.target_user_id;
    elsif v_shift_owner = v_req.target_user_id then
      v_new_user_id := v_req.requester_id;
    else
      return query select false, 'SHIFT_OWNERSHIP_CHANGED', array[]::uuid[];
      return;
    end if;

    update public.shifts
    set user_id = v_new_user_id
    where id = v_req.shift_id;

    v_shift_ids := array[v_req.shift_id];
  end if;

  update public.swap_requests
  set status = 'accepted', requester_read = false
  where id = v_req.id;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_auto_rejected_ids
  from public.swap_requests
  where status = 'pending'
    and id <> v_req.id
    and (
      shift_id = any(v_shift_ids)
      or coalesce(target_shift_id, '00000000-0000-0000-0000-000000000000'::uuid) = any(v_shift_ids)
    )
  for update;

  if coalesce(array_length(v_auto_rejected_ids, 1), 0) > 0 then
    update public.swap_requests
    set status = 'rejected', requester_read = false
    where id = any(v_auto_rejected_ids);
  end if;

  return query select true, null::text, v_auto_rejected_ids;
end;
$$;

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
    u.prefix as user_prefix,
    u.f_name as user_f_name,
    u.l_name as user_l_name,
    u.nickname as user_nickname,
    u.profile_image as user_profile_image
  from public.shifts s
  left join public.departments d on s.department_id = d.id
  left join public.users u on s.user_id = u.id;
