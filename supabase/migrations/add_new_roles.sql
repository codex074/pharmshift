-- Migration: Add new user roles
-- New roles: pharmacy_technician (เจ้าพนักงานเภสัชกรรม), officer (เจ้าหน้าที่)
--
-- The 'role' column is TEXT with no CHECK constraint, so new values are
-- accepted automatically. This script adds a comment and an optional
-- CHECK constraint update if you wish to enforce allowed values.
--
-- RUN IN SUPABASE SQL EDITOR

-- Document the allowed role values as a comment
COMMENT ON COLUMN public.users.role IS
  'Allowed values: pharmacist | pharmacy_technician | officer | admin';

-- Optional: if you want to enforce allowed values with a CHECK constraint
-- (only run if there is no existing CHECK constraint on this column)
-- ALTER TABLE public.users
--   ADD CONSTRAINT users_role_check
--   CHECK (role IN ('pharmacist', 'pharmacy_technician', 'officer', 'admin'));

-- Example: create an เจ้าพนักงานเภสัชกรรม user
-- INSERT INTO public.users (pha_id, name, fullname, role, password, must_change_password)
-- VALUES ('tech001', 'ชื่อ-สกุล', 'ชื่อเต็ม', 'pharmacy_technician', '1234', true);

-- Example: create an เจ้าหน้าที่ user
-- INSERT INTO public.users (pha_id, name, fullname, role, password, must_change_password)
-- VALUES ('off001', 'ชื่อ-สกุล', 'ชื่อเต็ม', 'officer', '1234', true);
