-- Hash legacy plain-text user passwords after deploying bcrypt-aware app code.
-- The app accepts both bcrypt hashes and legacy plain text during the rollout.
create extension if not exists "pgcrypto";

update public.users
set password = crypt(password, gen_salt('bf', 12))
where password is not null
  and password <> ''
  and password !~ '^\$2[aby]\$[0-9]{2}\$';
