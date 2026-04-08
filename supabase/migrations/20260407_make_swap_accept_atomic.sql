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
