-- Allow users to accept/receive overlapping same-shift assignments across
-- different rooms/positions. Overlap is handled as an app warning, not a DB
-- blocker. Keep an exact-slot uniqueness guard where existing data allows it.

alter table public.shifts
drop constraint if exists unique_user_date_shifttype;

do $$
begin
  alter table public.shifts
  add constraint unique_user_date_shifttype
  unique (user_id, date, shift_type, department_id, position)
  deferrable initially immediate;
exception
  when unique_violation then
    raise notice 'Skipped exact-slot unique constraint because duplicate shift rows already exist.';
end $$;
