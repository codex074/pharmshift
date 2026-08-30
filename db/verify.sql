-- Post-restore checklist. Every row should read OK.
\set ON_ERROR_STOP on
\pset footer off

select 'rpc functions (want 5 names)' as check,
       case when count(distinct proname) = 5 then 'OK' else 'FAIL' end as status,
       string_agg(distinct proname, ', ' order by proname) as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'accept_swap_request_atomic','accept_matched_swap_pair_atomic',
  'apply_admin_shift_changes_atomic','apply_shift_owner_edits_atomic','record_access');

-- The three swap RPCs check pg_constraint before `set constraints ... deferred`.
-- If this is not deferrable they skip it SILENTLY and two-leg swaps start
-- failing with 23505 that looks like a race condition.
select 'shifts unique constraint is DEFERRABLE' as check,
       case when bool_and(condeferrable) then 'OK' else 'FAIL' end as status,
       string_agg(conname || ' deferrable=' || condeferrable, ', ') as detail
from pg_constraint
where conrelid = 'public.shifts'::regclass and conname = 'unique_user_date_shifttype';

select 'triggers (want 7)' as check,
       case when count(*) = 7 then 'OK' else 'FAIL' end as status,
       string_agg(tgname, ', ' order by tgname) as detail
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal;

select 'RLS fully off' as check,
       case when count(*) = 0 then 'OK' else 'FAIL' end as status,
       coalesce(string_agg(relname, ', '), 'no table has relrowsecurity') as detail
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;

select 'no policies left' as check,
       case when count(*) = 0 then 'OK' else 'FAIL' end as status,
       count(*)::text || ' policies' as detail
from pg_policies where schemaname = 'public';

select 'stub auth schema removed' as check,
       case when count(*) = 0 then 'OK' else 'FAIL' end as status,
       count(*)::text as detail
from pg_namespace where nspname = 'auth';

select 'extensions schema kept (uuid_generate_v4 defaults need it)' as check,
       case when count(*) = 1 then 'OK' else 'FAIL' end as status,
       count(*)::text as detail
from pg_namespace where nspname = 'extensions';

select 'everything owned by pharmshift' as check,
       case when count(*) = 0 then 'OK' else 'FAIL' end as status,
       coalesce(string_agg(relname, ', '), 'none') as detail
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','S')
  and pg_get_userbyid(c.relowner) <> 'pharmshift';

\echo '--- row counts (compare against the production baseline) ---'
select c.relname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname),
              false, true, '')))[1]::text::bigint as rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
