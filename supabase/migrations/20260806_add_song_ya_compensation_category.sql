-- Add เวรส่งยา สอ. (Saturday medication-delivery shift, officer) as a compensation category.

alter table public.compensation_rates drop constraint if exists compensation_rates_category_check;
alter table public.compensation_rates add constraint compensation_rates_category_check check (
  category in ('rung_arun', 'project', 'regular', 'smc', 'chemo', 'song_ya')
);

insert into public.compensation_rates (category, role, rate) values
  ('song_ya', 'pharmacist', 60),
  ('song_ya', 'pharmacy_technician', 60),
  ('song_ya', 'officer', 60)
on conflict (category, role) do nothing;
