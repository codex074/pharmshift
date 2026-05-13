-- Tighten write policies that can safely be handled by server-side service-role
-- code after the corresponding API routes are deployed.

-- holidays: public read is okay, writes go through admin-only API routes.
do $$
begin
  if to_regclass('public.holidays') is not null then
    drop policy if exists "Enable insert for all" on public.holidays;
    drop policy if exists "Enable update for all" on public.holidays;
    drop policy if exists "Enable delete for all" on public.holidays;
    drop policy if exists "Enable all access for authenticated users" on public.holidays;
    drop policy if exists "Service role can write holidays" on public.holidays;

    create policy "Service role can write holidays"
      on public.holidays
      for all
      to service_role
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- notifications: inserts now go through /api/notifications with service role.
do $$
begin
  if to_regclass('public.notifications') is not null then
    drop policy if exists "notifications_insert_service" on public.notifications;
    drop policy if exists "Service role can insert notifications" on public.notifications;

    create policy "Service role can insert notifications"
      on public.notifications
      for insert
      to service_role
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- shift_logs: cleanup/server code uses service role; no client write path exists.
do $$
begin
  if to_regclass('public.shift_logs') is not null then
    drop policy if exists "Allow insert shift_logs" on public.shift_logs;
    drop policy if exists "Allow delete shift_logs" on public.shift_logs;
    drop policy if exists "Allow authenticated users to insert shift_logs" on public.shift_logs;
    drop policy if exists "Service role can insert shift_logs" on public.shift_logs;
    drop policy if exists "Service role can delete shift_logs" on public.shift_logs;

    create policy "Service role can insert shift_logs"
      on public.shift_logs
      for insert
      to service_role
      with check (auth.role() = 'service_role');

    create policy "Service role can delete shift_logs"
      on public.shift_logs
      for delete
      to service_role
      using (auth.role() = 'service_role');
  end if;
end $$;
