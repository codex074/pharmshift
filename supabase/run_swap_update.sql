-- RUN THIS IN SUPABASE SQL EDITOR TO UPDATE SCHEMA FOR SWAP AND TRANSFER FEATURES

ALTER TABLE public.swap_requests
ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'transfer' CHECK (request_type IN ('swap', 'transfer')),
ADD COLUMN IF NOT EXISTS target_shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE;
