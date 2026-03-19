-- Add is_active column to users table
-- Default true so all existing users remain active
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Optional: index for filtering active users
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users (is_active);
