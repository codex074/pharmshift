-- Add is_readonly column to users table
-- is_readonly = true means the user can login and view but cannot be assigned shifts or participate in swaps

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_readonly BOOLEAN NOT NULL DEFAULT FALSE;
