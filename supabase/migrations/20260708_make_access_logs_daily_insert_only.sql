-- Reduce access-log writes: keep only the first app-open record per user per day.
-- Repeated /api/auth/me calls should not update last_seen_at or hit_count.

create or replace function public.record_access(p_user_id uuid, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.access_logs (user_id, day)
  values (p_user_id, p_day)
  on conflict (user_id, day) do nothing;
$$;

revoke all on function public.record_access(uuid, date) from anon, authenticated;
grant execute on function public.record_access(uuid, date) to service_role;
