-- ============================================================
-- FIX: Allow all shift_type values & add position column
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================

-- 1. Drop old shift_type CHECK constraint and add new one with all types
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_shift_type_check
  CHECK (shift_type IN ('เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ'));

-- 2. Add position column (nullable)
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS position text;

-- 3. Drop old unique constraint and recreate with position included
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS unique_user_date_shifttype;
ALTER TABLE public.shifts ADD CONSTRAINT unique_user_date_shifttype
  UNIQUE (user_id, date, shift_type, position);
