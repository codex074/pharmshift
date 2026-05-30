create or replace function public.cleanup_swap_request_chain_hops(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with ranked as (
    select
      id,
      row_number() over (partition by shift_id order by created_at asc, id asc) as rn_oldest,
      row_number() over (partition by shift_id order by created_at desc, id desc) as rn_newest
    from public.swap_requests
    where status = 'accepted'
  ),
  to_delete as (
    select id
    from ranked
    where rn_oldest > 1
      and rn_newest > 1
    limit greatest(coalesce(p_limit, 1000), 0)
  ),
  deleted as (
    delete from public.swap_requests sr
    using to_delete td
    where sr.id = td.id
    returning sr.id
  )
  select count(*) into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;
