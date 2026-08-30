-- Run against a fresh stock postgres:17 BEFORE pg_restore of the public-schema dump.
-- Idempotent.
--
-- Two things in the dump reach outside `public` and make a naive restore fail:
--   1. holidays.id / shift_logs.id default to extensions.uuid_generate_v4()
--   2. seven RLS policies call auth.role() / auth.uid()
-- (1) is permanent — the default is evaluated on every INSERT, so the
-- `extensions` schema has to stay. (2) only has to survive the restore;
-- 02-post-restore.sql drops those policies and the stub schema afterwards.

\set ON_ERROR_STOP on

-- App role. Owns everything; the API routes are the only auth boundary.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pharmshift') then
    create role pharmshift login;
  end if;
end $$;
-- Set outside the DO block: psql does not interpolate :vars inside dollar quotes.
alter role pharmshift password :'app_password';

-- Stub roles so the dump's `TO service_role` / `TO anon` policies restore.
-- Dropped again by 02-post-restore.sql along with the policies naming them.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin; end if;
end $$;

-- Mirror Supabase's layout: extensions live in their own schema, because the
-- dumped column defaults are schema-qualified as extensions.uuid_generate_v4().
create schema if not exists extensions;
grant usage on schema extensions to public;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Stub auth schema: just enough for the policy bodies to parse during restore.
-- Under PostgREST these read the JWT claims; here nothing ever calls them.
create schema if not exists auth;
create or replace function auth.uid()  returns uuid     language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text     language sql stable as $$ select null::text $$;
grant usage on schema auth to public;
