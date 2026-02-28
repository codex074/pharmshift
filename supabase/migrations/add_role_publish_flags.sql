-- Migration: Add role specific publish flags to published_months table
-- RUN IN SUPABASE SQL EDITOR

ALTER TABLE public.published_months 
ADD COLUMN IF NOT EXISTS pharmacist_published BOOLEAN DEFAULT false;

ALTER TABLE public.published_months 
ADD COLUMN IF NOT EXISTS pharmacy_technician_published BOOLEAN DEFAULT false;

ALTER TABLE public.published_months 
ADD COLUMN IF NOT EXISTS officer_published BOOLEAN DEFAULT false;

-- Migrate existing published data so past months don't break
UPDATE public.published_months 
SET 
  pharmacist_published = true, 
  pharmacy_technician_published = true, 
  officer_published = true 
WHERE is_published = true;
