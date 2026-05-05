do $$
declare
  v_cols text;
  v_is_deferrable boolean;
begin
  select
    string_agg(quote_ident(a.attname), ', ' order by keys.ord),
    c.condeferrable
  into v_cols, v_is_deferrable
  from pg_constraint c
  join lateral unnest(c.conkey) with ordinality as keys(attnum, ord) on true
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = keys.attnum
  where c.conrelid = 'public.shifts'::regclass
    and c.conname = 'unique_user_date_shifttype'
  group by c.condeferrable;

  if v_cols is not null and not v_is_deferrable then
    alter table public.shifts drop constraint unique_user_date_shifttype;
    execute format(
      'alter table public.shifts add constraint unique_user_date_shifttype unique (%s) deferrable initially immediate',
      v_cols
    );
  end if;
end $$;

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

  perform set_config('app.current_user_id', p_actor_user_id::text, true);

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shifts'::regclass
      and conname = 'unique_user_date_shifttype'
      and condeferrable
  ) then
    execute 'set constraints unique_user_date_shifttype deferred';
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

  with rejected as (
    update public.swap_requests
    set status = 'rejected', requester_read = false
    where status = 'pending'
      and id <> v_req.id
      and (
        shift_id = any(v_shift_ids)
        or coalesce(target_shift_id, '00000000-0000-0000-0000-000000000000'::uuid) = any(v_shift_ids)
      )
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into v_auto_rejected_ids
  from rejected;

  return query select true, null::text, v_auto_rejected_ids;
end;
$$;

create or replace function public.apply_shift_owner_edits_atomic(
  p_edits jsonb,
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edit jsonb;
  v_shift_id uuid;
  v_user_id uuid;
begin
  if jsonb_typeof(p_edits) <> 'array' then
    raise exception 'p_edits must be a JSON array' using errcode = '22023';
  end if;

  if p_actor_user_id is not null then
    perform set_config('app.current_user_id', p_actor_user_id::text, true);
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shifts'::regclass
      and conname = 'unique_user_date_shifttype'
      and condeferrable
  ) then
    execute 'set constraints unique_user_date_shifttype deferred';
  end if;

  for v_edit in select * from jsonb_array_elements(p_edits)
  loop
    v_shift_id := (v_edit->>'shift_id')::uuid;
    v_user_id := (v_edit->>'user_id')::uuid;

    update public.shifts
    set user_id = v_user_id
    where id = v_shift_id;

    if not found then
      raise exception 'SHIFT_NOT_FOUND:%', v_shift_id using errcode = 'P0002';
    end if;
  end loop;
end;
$$;

revoke all on function public.apply_shift_owner_edits_atomic(jsonb, uuid) from public;
grant execute on function public.apply_shift_owner_edits_atomic(jsonb, uuid) to service_role;
