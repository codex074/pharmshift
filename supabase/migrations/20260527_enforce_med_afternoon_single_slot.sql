create or replace function public.enforce_med_afternoon_single_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department_name text;
  v_user_role text;
begin
  select name
  into v_department_name
  from public.departments
  where id = new.department_id;

  if new.shift_type = 'บ่าย' and upper(coalesce(v_department_name, '')) = 'MED' then
    select role
    into v_user_role
    from public.users
    where id = new.user_id;

    perform pg_advisory_xact_lock(
      hashtext('med-afternoon-slot'),
      hashtext(coalesce(new.date::text, '') || ':' || coalesce(v_user_role, ''))
    );

    if exists (
      select 1
      from public.shifts s
      join public.departments d on d.id = s.department_id
      join public.users u on u.id = s.user_id
      where s.id <> new.id
        and s.date = new.date
        and s.shift_type = 'บ่าย'
        and upper(d.name) = 'MED'
        and u.role = v_user_role
    ) then
      raise exception 'AFTERNOON_MED_SLOT_FULL'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_med_afternoon_single_slot_trigger on public.shifts;
create trigger enforce_med_afternoon_single_slot_trigger
before insert or update of date, department_id, shift_type, user_id
on public.shifts
for each row
execute function public.enforce_med_afternoon_single_slot();

revoke all on function public.enforce_med_afternoon_single_slot() from public;
grant execute on function public.enforce_med_afternoon_single_slot() to service_role;
