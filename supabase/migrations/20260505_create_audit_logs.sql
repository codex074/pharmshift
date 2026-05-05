create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_snapshot jsonb,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_user_id, created_at desc);

create index if not exists audit_logs_entity_created_idx
  on public.audit_logs (entity_type, created_at desc);

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
grant select, insert on table public.audit_logs to service_role;

create or replace function public.audit_actor_snapshot(p_actor_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select to_jsonb(u) - 'password'
  from (
    select id, pha_id, prefix, f_name, l_name, nickname, role
    from public.users
    where id = p_actor_user_id
  ) u;
$$;

create or replace function public.audit_redact_row(p_table_name text, p_data jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if p_data is null then
    return null;
  end if;

  p_data := p_data - 'password' - 'token' - 'auth' - 'p256dh';

  if p_table_name = 'push_subscriptions' then
    p_data := p_data - 'endpoint';
  end if;

  return p_data;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_text text;
  v_actor_user_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_entity_id text;
begin
  v_actor_text := nullif(current_setting('app.current_user_id', true), '');

  if v_actor_text is not null then
    begin
      v_actor_user_id := v_actor_text::uuid;
    exception when others then
      v_actor_user_id := null;
    end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := public.audit_redact_row(tg_table_name, to_jsonb(old));
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new := public.audit_redact_row(tg_table_name, to_jsonb(new));
  end if;

  v_entity_id := coalesce(
    v_new->>'id',
    v_old->>'id',
    v_new->>'month_year',
    v_old->>'month_year',
    v_new->>'date',
    v_old->>'date'
  );

  insert into public.audit_logs (
    actor_user_id,
    actor_snapshot,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    v_actor_user_id,
    case when v_actor_user_id is not null then public.audit_actor_snapshot(v_actor_user_id) else null end,
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    v_old,
    v_new,
    jsonb_build_object('schema', tg_table_schema)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'users',
    'departments',
    'shifts',
    'swap_requests',
    'published_months',
    'holidays',
    'notifications',
    'push_subscriptions',
    'shift_logs'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('drop trigger if exists audit_%I_row_change on public.%I', v_table, v_table);
      execute format(
        'create trigger audit_%I_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
        v_table,
        v_table
      );
    end if;
  end loop;
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

create or replace function public.apply_admin_shift_changes_atomic(
  p_delete_ids uuid[] default array[]::uuid[],
  p_owner_edits jsonb default '[]'::jsonb,
  p_adds jsonb default '[]'::jsonb,
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edit jsonb;
  v_add jsonb;
  v_shift_id uuid;
  v_user_id uuid;
begin
  p_delete_ids := coalesce(p_delete_ids, array[]::uuid[]);
  p_owner_edits := coalesce(p_owner_edits, '[]'::jsonb);
  p_adds := coalesce(p_adds, '[]'::jsonb);

  if jsonb_typeof(p_owner_edits) <> 'array' then
    raise exception 'p_owner_edits must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_typeof(p_adds) <> 'array' then
    raise exception 'p_adds must be a JSON array' using errcode = '22023';
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

  if array_length(p_delete_ids, 1) is not null then
    delete from public.shifts
    where id = any(p_delete_ids);
  end if;

  for v_edit in select * from jsonb_array_elements(p_owner_edits)
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

  for v_add in select * from jsonb_array_elements(p_adds)
  loop
    insert into public.shifts (
      date,
      department_id,
      shift_type,
      position,
      user_id,
      original_user_id,
      month_year
    )
    values (
      (v_add->>'date')::date,
      (v_add->>'department_id')::integer,
      v_add->>'shift_type',
      nullif(v_add->>'position', ''),
      (v_add->>'user_id')::uuid,
      nullif(v_add->>'original_user_id', '')::uuid,
      v_add->>'month_year'
    );
  end loop;
end;
$$;

revoke all on function public.apply_admin_shift_changes_atomic(uuid[], jsonb, jsonb, uuid) from public;
grant execute on function public.apply_admin_shift_changes_atomic(uuid[], jsonb, jsonb, uuid) to service_role;
