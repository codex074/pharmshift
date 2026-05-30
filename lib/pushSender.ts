/**
 * Server-side push notification sender using web-push
 */
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { isMobileUserAgent } from '@/lib/deviceDetection';

let vapidReady = false;
let vapidChecked = false;

function ensureVapidConfigured() {
  if (vapidReady) return true;
  if (vapidChecked) return false;
  vapidChecked = true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys missing; push delivery disabled');
    return false;
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:pharmacy@hospital.go.th',
      publicKey,
      privateKey
    );
    vapidReady = true;
    return true;
  } catch (error) {
    console.error('[push] invalid VAPID config; push delivery disabled:', error);
    return false;
  }
}

async function limitedAllSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
) {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...await Promise.allSettled(items.slice(i, i + limit).map(fn)));
  }
  return results;
}

// Service-role Supabase client for server-side operations
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}

/** Send push notification to a specific user (all their devices) */
export async function sendPushToUser(
  userId: string,
  payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapidConfigured()) {
    return { sent: 0, failed: 0 };
  }

  const supabase = getSupabaseAdmin();

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_agent')
    .eq('user_id', userId);

  if (error || !subscriptions?.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  await limitedAllSettled(
    subscriptions,
    10,
    async (sub) => {
      if (!isMobileUserAgent(sub.user_agent)) {
        return;
      }

      const pushSubscription: webpush.PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        failed++;
        // 404 or 410 = subscription expired/invalid → cleanup
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    }
  );

  // Cleanup stale subscriptions
  if (staleIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', staleIds);
  }

  return { sent, failed };
}

/** Send push notification to multiple users */
export async function sendPushToUsers(
  userIds: string[],
  payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  const results = await limitedAllSettled(userIds, 20, (uid) => sendPushToUser(uid, payload));

  let totalSent = 0;
  let totalFailed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      totalSent += r.value.sent;
      totalFailed += r.value.failed;
    }
  }

  return { sent: totalSent, failed: totalFailed };
}
