-- Migration: add 'cover' to swap_requests request_type check constraint
-- Run this in Supabase SQL Editor

ALTER TABLE swap_requests
  DROP CONSTRAINT IF EXISTS swap_requests_request_type_check;

ALTER TABLE swap_requests
  ADD CONSTRAINT swap_requests_request_type_check
  CHECK (request_type IN ('swap', 'transfer', 'cover'));
