-- Run after EVERY pg_restore of the public-schema dump — P1, P5, and P6 step 2.
-- Idempotent.
--
-- Why this must never be skipped: the SSE notify function and its four triggers
-- exist only here (they were never on the old Supabase box, so they do not
-- travel in the dump), and `drop schema public cascade` before a re-restore
-- takes them with it. Miss this and realtime dies silently — no error, events
-- simply stop firing and it looks like "realtime is flaky".
--
-- pg_dump also emits CREATE POLICY and ENABLE ROW LEVEL SECURITY (--no-acl
-- strips only GRANT/REVOKE), so a re-restore resurrects the RLS that this
-- migration deliberately removed.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Change notification for the SSE stream (replaces Supabase Realtime)
-- ---------------------------------------------------------------------------
-- Payload carries ids and routing keys only, never row data: pg_notify caps at
-- 8000 bytes, and row data would leak across users. The client refetches by id,
-- which is what the existing handlers already do.

create or replace function public.app_notify_change() returns trigger
language plpgsql as $$
declare
  r record;
  payload jsonb;
begin
  r := coalesce(new, old);

  -- published_months has no id column; its primary key is month_year.
  if tg_table_name = 'published_months' then
    payload := jsonb_build_object('table', tg_table_name, 'op', tg_op,
                                  'month_year', r.month_year);
  else
    payload := jsonb_build_object('table', tg_table_name, 'op', tg_op, 'id', r.id);

    if tg_table_name = 'shifts' then
      payload := payload || jsonb_build_object('month_year', r.month_year,
                                               'user_id', r.user_id);
    elsif tg_table_name = 'swap_requests' then
      payload := payload || jsonb_build_object('requester_id', r.requester_id,
                                               'target_user_id', r.target_user_id);
    elsif tg_table_name = 'notifications' then
      payload := payload || jsonb_build_object('user_id', r.user_id);
    end if;
  end if;

  perform pg_notify('app_events', payload::text);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['shifts', 'swap_requests', 'notifications', 'published_months'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_notify', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.app_notify_change()',
      t || '_notify', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Remove RLS
-- ---------------------------------------------------------------------------
-- Every policy in the dump is either `using (true)` or calls auth.uid()/auth.role(),
-- which are always NULL here — auth is a custom `jose` JWT, never Supabase Auth.
-- They protected nothing; PostgREST + the browser-side anon key were the real
-- exposure (R20), and both are gone. The API routes are the boundary now.

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;

  for p in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('alter table public.%I disable row level security', p.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Drop the restore-only stubs
-- ---------------------------------------------------------------------------
-- Safe now that no policy references them. `extensions` stays — holidays.id and
-- shift_logs.id call extensions.uuid_generate_v4() on every insert, forever.

drop schema if exists auth cascade;
drop role if exists anon;
drop role if exists authenticated;
drop role if exists service_role;

-- ---------------------------------------------------------------------------
-- 4. Hand the schema to the app role
-- ---------------------------------------------------------------------------
alter schema public owner to pharmshift;
do $$
declare o record;
begin
  for o in select c.relname, c.relkind from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','v','S')
  loop
    execute format('alter %s public.%I owner to pharmshift',
                   case o.relkind when 'r' then 'table' when 'v' then 'view' else 'sequence' end,
                   o.relname);
  end loop;

  for o in select p.oid::regprocedure as sig from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  loop
    execute format('alter function %s owner to pharmshift', o.sig);
  end loop;
end $$;
