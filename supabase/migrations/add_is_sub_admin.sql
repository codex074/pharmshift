-- Migration: Add is_sub_admin flag to users table
-- Sub-admins can manage shifts (upload, edit, publish) for their own role group only.
-- Only staff roles (pharmacist, pharmacy_technician, officer) should be sub-admins.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_sub_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_sub_admin IS
  'When true, this staff user can manage shifts (upload, edit, publish) for their own role group only.';
