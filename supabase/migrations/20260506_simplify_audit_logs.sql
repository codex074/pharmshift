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
    end if;
  end loop;
end $$;

drop function if exists public.audit_row_change();
drop function if exists public.audit_redact_row(text, jsonb);
drop function if exists public.audit_actor_snapshot(uuid);

alter table public.audit_logs
  add column if not exists actor_name text,
  add column if not exists description text;

update public.audit_logs as logs
set actor_name = coalesce(
  users.nickname,
  nullif(trim(concat_ws(' ', users.prefix, users.f_name, users.l_name)), ''),
  'ไม่ทราบผู้ใช้'
)
from public.users as users
where logs.actor_user_id = users.id;

do $$
declare
  v_has_actor_snapshot boolean;
  v_has_entity_type boolean;
  v_has_before_data boolean;
  v_has_after_data boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'actor_snapshot'
  ) into v_has_actor_snapshot;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'entity_type'
  ) into v_has_entity_type;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'before_data'
  ) into v_has_before_data;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'after_data'
  ) into v_has_after_data;

  if v_has_actor_snapshot then
    execute $sql$
      update public.audit_logs
      set actor_name = coalesce(
        actor_name,
        actor_snapshot->>'nickname',
        nullif(trim(concat_ws(' ', actor_snapshot->>'prefix', actor_snapshot->>'f_name', actor_snapshot->>'l_name')), ''),
        'ระบบ'
      )
      where actor_name is null
    $sql$;
  else
    update public.audit_logs
    set actor_name = coalesce(actor_name, 'ระบบ')
    where actor_name is null;
  end if;

  update public.audit_logs
  set action = 'login'
  where action = 'login_success';

  if v_has_entity_type then
    execute $sql$
      update public.audit_logs
      set action = 'publish_schedule'
      where entity_type = 'published_months'
    $sql$;

    execute $sql$
      update public.audit_logs
      set action = case
          when action = 'insert' then 'add_shift'
          when action = 'update' then 'edit_shift'
          when action = 'delete' then 'delete_shift'
          else action
        end
      where entity_type = 'shifts'
        and action in ('insert', 'update', 'delete')
    $sql$;
  end if;

  if v_has_entity_type and (v_has_before_data or v_has_after_data) then
    execute $sql$
      update public.audit_logs
      set action = case
          when coalesce(after_data->>'request_type', before_data->>'request_type') = 'swap' then 'request_swap'
          when coalesce(after_data->>'request_type', before_data->>'request_type') = 'cover' then 'request_cover'
          when coalesce(after_data->>'request_type', before_data->>'request_type') = 'transfer' then 'request_transfer'
          else action
        end
      where entity_type = 'swap_requests'
    $sql$;
  end if;
end $$;

delete from public.audit_logs
where action in ('login_failed', 'login_blocked', 'logout');

update public.audit_logs
set description = case
    when action = 'login' then 'เข้าสู่ระบบ'
    when action = 'publish_schedule' then 'ประกาศตารางเวร'
    when action = 'add_shift' then 'เพิ่มเวร'
    when action = 'edit_shift' then 'แก้ไขเวร'
    when action = 'delete_shift' then 'ลบเวร'
    when action = 'request_swap' then 'ขอแลกเวร'
    when action = 'request_cover' then 'ขออยู่แทน'
    when action = 'request_transfer' then 'โอนเวร'
    when action = 'export_report' then 'ดึงรายงาน'
    else description
  end
where description is null
   or description not in (
     'เข้าสู่ระบบ',
     'ประกาศตารางเวร',
     'เพิ่มเวร',
     'แก้ไขเวร',
     'ลบเวร',
     'ขอแลกเวร',
     'ขออยู่แทน',
     'โอนเวร',
     'ดึงรายงาน'
   );

delete from public.audit_logs
where action not in (
  'login',
  'publish_schedule',
  'add_shift',
  'edit_shift',
  'delete_shift',
  'request_swap',
  'request_cover',
  'request_transfer',
  'export_report'
);

alter table public.audit_logs
  drop column if exists actor_snapshot,
  drop column if exists entity_type,
  drop column if exists entity_id,
  drop column if exists before_data,
  drop column if exists after_data,
  drop column if exists metadata,
  drop column if exists ip_address,
  drop column if exists user_agent;

alter table public.audit_logs
  alter column actor_name set not null,
  alter column description set not null;

drop index if exists audit_logs_entity_created_idx;
drop index if exists audit_logs_actor_created_idx;
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_name, created_at desc);
