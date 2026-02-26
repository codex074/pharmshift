-- RUN THIS IN SUPABASE SQL EDITOR TO ENFORCE UNIQUE SHIFTS PER USER PER DAY + TYPE

ALTER TABLE public.shifts 
ADD CONSTRAINT unique_user_date_shifttype UNIQUE (user_id, date, shift_type);
