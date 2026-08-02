-- Per-subscription delivery log for push notifications.
-- The shift-reminders cron only ever reported aggregate sent/failed counts
-- (in the HTTP response, captured by the VPS cron log), so a partial-delivery
-- report ("some devices didn't get notified") couldn't be traced to a
-- specific user/device or error. This table records one row per send attempt,
-- written by lib/pushSender.ts.

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  endpoint_host text,
  success boolean not null,
  status_code integer,
  error_message text,
  tag text
);

create index if not exists push_delivery_log_user_created_idx
  on public.push_delivery_log (user_id, created_at desc);

create index if not exists push_delivery_log_failed_idx
  on public.push_delivery_log (created_at desc)
  where success = false;

alter table public.push_delivery_log enable row level security;
revoke all on table public.push_delivery_log from anon, authenticated;
grant select, insert, update, delete on table public.push_delivery_log to service_role;
