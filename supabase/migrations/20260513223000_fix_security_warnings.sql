-- Fix low-risk Supabase Security Advisor warnings.
--
-- This migration intentionally avoids tightening broad RLS write policies on
-- shifts, swap_requests, users, holidays, and published_months because the app
-- still has client-side flows that depend on the current custom-session model.

-- Functions should not inherit a caller-controlled search_path.
alter function public.handle_updated_at()
  set search_path = public, pg_temp;

alter function public.accept_swap_request_atomic(uuid, uuid)
  set search_path = public, pg_temp;

-- SECURITY DEFINER functions are only called from server routes using the
-- service role. Remove direct PostgREST/RPC access from anon/authenticated.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'apply_admin_shift_changes_atomic',
        'apply_shift_owner_edits_atomic'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- This table is managed through service-role API/cron code, so avoid a policy
-- that applies to every role with USING/WITH CHECK true.
do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    drop policy if exists "Service role full access" on public.push_subscriptions;
    create policy "Service role full access" on public.push_subscriptions
      for all
      to service_role
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
