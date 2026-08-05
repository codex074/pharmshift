-- Auto-confirm a pair of independently-created swap_requests that mirror each
-- other (e.g. A requests to cover B's shift while B independently transfers
-- that same shift to A; or A and B each request to swap with the other).
-- Performs the single underlying shift mutation once and marks BOTH rows
-- 'accepted' (unlike accept_swap_request_atomic, which would mark the second
-- row 'rejected' as an auto-cancel side effect).
create or replace function public.accept_matched_swap_pair_atomic(
  p_new_swap_id uuid,
  p_existing_swap_id uuid
)
returns table (
  ok boolean,
  error_code text,
  auto_rejected_ids uuid[]
)
language plpgsql
as $$
declare
  v_first_id uuid := least(p_new_swap_id, p_existing_swap_id);
  v_second_id uuid := greatest(p_new_swap_id, p_existing_swap_id);
  v_a public.swap_requests%rowtype;
  v_b public.swap_requests%rowtype;
  v_shift_owner uuid;
  v_target_shift_owner uuid;
  v_new_user_id uuid;
  v_shift_ids uuid[];
  v_auto_rejected_ids uuid[];
begin
  -- Lock both rows in a deterministic order to avoid deadlocks with
  -- concurrent accept_matched_swap_pair_atomic / accept_swap_request_atomic calls.
  perform 1 from public.swap_requests where id = v_first_id for update;
  perform 1 from public.swap_requests where id = v_second_id for update;

  select * into v_a from public.swap_requests where id = p_new_swap_id;
  select * into v_b from public.swap_requests where id = p_existing_swap_id;

  if v_a.id is null or v_b.id is null then
    return query select false, 'NOT_FOUND', array[]::uuid[];
    return;
  end if;

  if v_a.status <> 'pending' or v_b.status <> 'pending' then
    return query select false, 'ALREADY_PROCESSED', array[]::uuid[];
    return;
  end if;

  -- Mirror relationship: each request's requester is the other's target.
  if v_a.requester_id <> v_b.target_user_id or v_a.target_user_id <> v_b.requester_id then
    return query select false, 'NOT_MIRRORED', array[]::uuid[];
    return;
  end if;

  -- Attribute the resulting shift edit to whichever request was just
  -- created — their action is what completed the match.
  perform set_config('app.current_user_id', v_a.requester_id::text, true);

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shifts'::regclass
      and conname = 'unique_user_date_shifttype'
      and condeferrable
  ) then
    execute 'set constraints unique_user_date_shifttype deferred';
  end if;

  if v_a.request_type = 'swap' and v_b.request_type = 'swap' then
    if v_a.shift_id <> v_b.target_shift_id or v_a.target_shift_id <> v_b.shift_id then
      return query select false, 'NOT_MIRRORED', array[]::uuid[];
      return;
    end if;

    select user_id into v_shift_owner from public.shifts where id = v_a.shift_id for update;
    select user_id into v_target_shift_owner from public.shifts where id = v_a.target_shift_id for update;

    if v_shift_owner is null or v_target_shift_owner is null then
      return query select false, 'SHIFT_NOT_FOUND', array[]::uuid[];
      return;
    end if;

    if v_shift_owner <> v_a.target_user_id or v_target_shift_owner <> v_a.requester_id then
      return query select false, 'SHIFT_OWNERSHIP_CHANGED', array[]::uuid[];
      return;
    end if;

    update public.shifts set user_id = v_a.requester_id where id = v_a.shift_id;
    update public.shifts set user_id = v_a.target_user_id where id = v_a.target_shift_id;

    v_shift_ids := array[v_a.shift_id, v_a.target_shift_id];
  elsif v_a.request_type in ('transfer', 'cover') and v_b.request_type in ('transfer', 'cover') then
    if v_a.shift_id <> v_b.shift_id or v_a.target_shift_id is not null or v_b.target_shift_id is not null then
      return query select false, 'NOT_MIRRORED', array[]::uuid[];
      return;
    end if;

    select user_id into v_shift_owner from public.shifts where id = v_a.shift_id for update;

    if v_shift_owner is null then
      return query select false, 'SHIFT_NOT_FOUND', array[]::uuid[];
      return;
    end if;

    if v_shift_owner = v_a.requester_id then
      v_new_user_id := v_a.target_user_id;
    elsif v_shift_owner = v_a.target_user_id then
      v_new_user_id := v_a.requester_id;
    else
      return query select false, 'SHIFT_OWNERSHIP_CHANGED', array[]::uuid[];
      return;
    end if;

    update public.shifts set user_id = v_new_user_id where id = v_a.shift_id;

    v_shift_ids := array[v_a.shift_id];
  else
    return query select false, 'NOT_MIRRORED', array[]::uuid[];
    return;
  end if;

  update public.swap_requests
  set status = 'accepted', requester_read = false
  where id in (v_a.id, v_b.id);

  with rejected as (
    update public.swap_requests
    set status = 'rejected', requester_read = false
    where status = 'pending'
      and id not in (v_a.id, v_b.id)
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
