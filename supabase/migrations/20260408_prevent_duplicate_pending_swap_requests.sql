create unique index if not exists swap_requests_uniq_pending_request_idx
on public.swap_requests (
  shift_id,
  requester_id,
  target_user_id,
  request_type,
  coalesce(target_shift_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where status = 'pending';
