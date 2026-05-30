-- Store compensation rates outside the application code.
-- One row represents one compensation category and one staff role.

create table if not exists public.compensation_rates (
  category   text not null,
  role       text not null,
  rate       numeric(10,2) not null check (rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category, role),
  constraint compensation_rates_category_check check (
    category in ('rung_arun', 'project', 'regular', 'smc', 'chemo')
  ),
  constraint compensation_rates_role_check check (
    role in ('pharmacist', 'pharmacy_technician', 'officer')
  )
);

insert into public.compensation_rates (category, role, rate) values
  ('rung_arun', 'pharmacist', 135),
  ('rung_arun', 'pharmacy_technician', 90),
  ('rung_arun', 'officer', 56.25),
  ('project', 'pharmacist', 135),
  ('project', 'pharmacy_technician', 90),
  ('project', 'officer', 56.25),
  ('regular', 'pharmacist', 780),
  ('regular', 'pharmacy_technician', 520),
  ('regular', 'officer', 330),
  ('smc', 'pharmacist', 900),
  ('smc', 'pharmacy_technician', 600),
  ('smc', 'officer', 375),
  ('chemo', 'pharmacist', 390),
  ('chemo', 'pharmacy_technician', 390),
  ('chemo', 'officer', 390)
on conflict (category, role) do nothing;

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public, pg_temp;

drop trigger if exists compensation_rates_updated_at on public.compensation_rates;
create trigger compensation_rates_updated_at
  before update on public.compensation_rates
  for each row execute procedure public.handle_updated_at();

alter table public.compensation_rates enable row level security;

drop policy if exists "Anyone can read compensation rates" on public.compensation_rates;
create policy "Anyone can read compensation rates" on public.compensation_rates
  for select to anon, authenticated using (true);

grant select on public.compensation_rates to anon, authenticated;
grant all on public.compensation_rates to service_role;
