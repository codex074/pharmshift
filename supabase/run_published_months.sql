-- Create the published_months table if it doesn't exist
create table if not exists public.published_months (
  month_year text primary key, -- 'YYYY-MM'
  is_published boolean default false,
  published_at timestamptz,
  published_by uuid references public.users(id)
);

-- Grant privileges for PostgREST to access the table
grant all privileges on table public.published_months to anon, authenticated, service_role;

-- Enable RLS
alter table public.published_months enable row level security;

-- Drop previous policies if the user ran the old script
drop policy if exists "Anyone can read published_months" on public.published_months;
drop policy if exists "Admins can insert published_months" on public.published_months;
drop policy if exists "Admins can update published_months" on public.published_months;

-- The app uses custom authentication (auth.uid() is not available).
-- Security is handled at the application layer, so we use using(true) for policies.
create policy "Anyone can read published_months" 
  on public.published_months
  for select using (true);

create policy "Anyone can insert published_months"
  on public.published_months
  for insert with check (true);

create policy "Anyone can update published_months"
  on public.published_months
  for update using (true);
