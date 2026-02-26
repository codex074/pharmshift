-- RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR

-- 1. Modify users table
alter table public.users drop column if exists auth_id cascade;
alter table public.users add column if not exists password text default '1234';
alter table public.users add column if not exists fullname text;

-- 2. Drop existing RLS policies
drop policy if exists "Users can read all pharmacists" on public.users;
drop policy if exists "Users can update own record" on public.users;
drop policy if exists "Authenticated users can read shifts" on public.shifts;
drop policy if exists "Admins and owners can update shifts" on public.shifts;
drop policy if exists "Users can see swap requests involving them" on public.swap_requests;
drop policy if exists "Users can create swap requests" on public.swap_requests;
drop policy if exists "Target user can update (accept/reject)" on public.swap_requests;
drop policy if exists "Service role can insert users" on public.users;
drop policy if exists "Admins and owners can delete shifts" on public.shifts;
drop policy if exists "Service role can insert shifts" on public.shifts;
drop policy if exists "Allowed to delete swap requests" on public.swap_requests;

-- 3. Create open RLS policies (so client-side JS can still work via anon key)
create policy "Users can read all pharmacists" on public.users for select using (true);
create policy "Users can update own record" on public.users for update using (true);
create policy "Service role can insert users" on public.users for insert with check (true);

create policy "Authenticated users can read shifts" on public.shifts for select using (true);
create policy "Admins and owners can update shifts" on public.shifts for update using (true);
create policy "Admins and owners can delete shifts" on public.shifts for delete using (true);
create policy "Service role can insert shifts" on public.shifts for insert with check (true);

create policy "Users can see swap requests involving them" on public.swap_requests for select using (true);
create policy "Users can create swap requests" on public.swap_requests for insert with check (true);
create policy "Target user can update (accept/reject)" on public.swap_requests for update using (true);
create policy "Allowed to delete swap requests" on public.swap_requests for delete using (true);
