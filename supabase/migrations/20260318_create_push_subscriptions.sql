-- Push notification subscriptions table
-- Stores Web Push API subscription data per user per device

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(endpoint)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: service role can do everything (used by API routes)
DROP POLICY IF EXISTS "Service role full access" ON public.push_subscriptions;
CREATE POLICY "Service role full access" ON public.push_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);
