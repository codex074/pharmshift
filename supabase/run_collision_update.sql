-- RUN THIS IN SUPABASE SQL EDITOR TO PREVENT EXACT DUPLICATE SHIFT SLOTS ONLY.
-- Same user + date + shift type in different rooms/positions is allowed and
-- should be shown as a warning in the app, not blocked by the database.

ALTER TABLE public.shifts
DROP CONSTRAINT IF EXISTS unique_user_date_shifttype;

ALTER TABLE public.shifts
ADD CONSTRAINT unique_user_date_shifttype
UNIQUE (user_id, date, shift_type, department_id, position)
DEFERRABLE INITIALLY IMMEDIATE;
