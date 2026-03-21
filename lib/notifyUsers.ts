import type { AppNotificationType } from '@/lib/types';

/**
 * Insert in-app notifications for a list of users via the server-side API route.
 * Fire-and-forget — does not throw, so it never blocks the caller's main flow.
 *
 * Uses POST /api/notifications which now uses SUPABASE_SERVICE_ROLE_KEY
 * to bypass GRANT/RLS restrictions on the notifications table.
 */
export function insertNotifications(
  userIds: string[],
  type: AppNotificationType,
  title: string,
  body: string,
  url: string = '/calendar',
): void {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: ids, type, title, body, url }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[insertNotifications] POST failed:', res.status, data);
      }
    })
    .catch((err) => {
      console.error('[insertNotifications] fetch error:', err);
    });
}
