-- Add last_used_at to push_subscriptions so cleanup can distinguish
-- stale subscriptions from active ones (R6 fix).
alter table push_subscriptions
  add column if not exists last_used_at timestamptz;

-- Backfill existing rows so they are not immediately eligible for deletion.
update push_subscriptions
  set last_used_at = coalesce(last_used_at, created_at, now())
  where last_used_at is null;
