alter table public.audit_logs
  add column if not exists entity_id text;

create index if not exists audit_logs_entity_id_idx
  on public.audit_logs (entity_id)
  where entity_id is not null;
