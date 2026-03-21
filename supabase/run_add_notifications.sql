-- In-app notifications table
-- Stores persistent notifications shown in the bell panel

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,  -- 'shift_assigned' | 'shift_changed' | 'shift_removed' | 'schedule_published'
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  url         TEXT        DEFAULT '/calendar',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- Disable RLS (app uses iron-session, not Supabase Auth — auth.uid() always returns NULL)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Grant full access to anon and authenticated roles
-- (required for tables created via raw SQL — dashboard-created tables get these grants automatically)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO authenticated;

-- Enable realtime so the client can react to INSERT events instantly
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
