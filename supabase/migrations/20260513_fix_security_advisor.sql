-- Fix Supabase Security Advisor findings:
-- 1. Enable RLS on public.departments.
-- 2. Make public.shifts_full run with caller permissions instead of owner permissions.

insert into public.departments (name) values
  ('Chemo'),
  ('ส่งยา สอ.')
on conflict (name) do nothing;

alter table public.departments enable row level security;

drop policy if exists "Anyone can read departments" on public.departments;
create policy "Anyone can read departments" on public.departments
  for select to anon, authenticated using (true);

create or replace view public.shifts_full
with (security_invoker = true) as
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
