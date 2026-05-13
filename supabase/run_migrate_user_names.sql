-- ============================================================
-- Migration: แยก name → prefix, f_name, l_name
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop the view FIRST (it depends on "name" column)
DROP VIEW IF EXISTS public.shifts_full;

-- 2. Add new columns (if not exist)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS f_name text NOT NULL DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS l_name text NOT NULL DEFAULT '';

-- 3. Migrate existing data: copy deprecated "name" into f_name as fallback
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE public.users
      SET f_name = COALESCE(name, ''''),
          l_name = ''''
      WHERE f_name = '''' OR f_name IS NULL';
  END IF;
END $$;

-- 4. Drop deprecated columns (name, fullname)
ALTER TABLE public.users DROP COLUMN IF EXISTS name;
ALTER TABLE public.users DROP COLUMN IF EXISTS fullname;

-- 5. Add salary_number if not exists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS salary_number text;

-- 6. Recreate the shifts_full view with new columns
CREATE OR REPLACE VIEW public.shifts_full
WITH (security_invoker = true) AS
  SELECT
    s.id,
    s.date,
    s.shift_type,
    s.month_year,
    s.created_at,
    d.id   AS department_id,
    d.name AS department_name,
    u.id   AS user_id,
    u.prefix AS user_prefix,
    u.f_name AS user_f_name,
    u.l_name AS user_l_name,
    u.nickname AS user_nickname,
    u.profile_image AS user_profile_image
  FROM public.shifts s
  LEFT JOIN public.departments d ON s.department_id = d.id
  LEFT JOIN public.users u ON s.user_id = u.id;
