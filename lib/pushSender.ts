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

export async function limitedAllSettled<T, R>(
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

interface DeliveryLogRow {
  user_id: string;
  subscription_id: string;
  endpoint_host: string | null;
  success: boolean;
  status_code: number | null;
  error_message: string | null;
  tag: string | null;
}

function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}

// A failed connect on Node 20+ (happy eyeballs) throws an AggregateError whose
// .message is "" — String(err.message) alone logged those as empty rows
// (seen 2026-08-31: 17 Apple sends failed with no trace). Always include
// name/code and the sub-errors so the delivery log says what actually happened.
function describePushError(err: any): string {
  const parts: string[] = [];
  if (err?.message) parts.push(String(err.message));
  else if (err?.name) parts.push(String(err.name));
  if (err?.code) parts.push(`code=${err.code}`);
  if (Array.isArray(err?.errors)) {
    for (const sub of err.errors.slice(0, 4)) {
      parts.push(`[${[sub?.code, sub?.address, sub?.message].filter(Boolean).join(' ')}]`);
    }
  }
  return (parts.join(' ') || String(err)).slice(0, 500);
}

async function sendWithRetry(
  pushSubscription: webpush.PushSubscription,
  body: string
) {
  try {
    return await webpush.sendNotification(pushSubscription, body);
  } catch (err: any) {
    // Only network-level failures (no HTTP status) get one retry — an HTTP
    // response like 404/410 is definitive and must reach the stale-cleanup path.
    if (err?.statusCode != null) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await webpush.sendNotification(pushSubscription, body);
  }
}

/** Send push notification to a specific user (all their devices) */
export async function sendPushToUser(
  userId: string,
  payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapidConfigured()) {
    console.error('[push] skipped send: VAPID not configured');
    return { sent: 0, failed: 0 };
  }

  const supabase = getSupabaseAdmin();

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_agent')
    .eq('user_id', userId);

  if (error) {
    console.error('[push] failed to load subscriptions for user', userId, error);
    return { sent: 0, failed: 0 };
  }
  if (!subscriptions?.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];
  const sentIds: string[] = [];
  const logRows: DeliveryLogRow[] = [];

  await limitedAllSettled(
    subscriptions,
    10,
    async (sub) => {
      if (!isMobileUserAgent(sub.user_agent)) {
        logRows.push({
          user_id: userId,
          subscription_id: sub.id,
          endpoint_host: endpointHost(sub.endpoint),
          success: false,
          status_code: null,
          error_message: 'skipped: non-mobile user_agent',
          tag: payload.tag ?? null,
        });
        return;
      }

      const pushSubscription: webpush.PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await sendWithRetry(pushSubscription, JSON.stringify(payload));
        sent++;
        sentIds.push(sub.id);
        logRows.push({
          user_id: userId,
          subscription_id: sub.id,
          endpoint_host: endpointHost(sub.endpoint),
          success: true,
          status_code: null,
          error_message: null,
          tag: payload.tag ?? null,
        });
      } catch (err: any) {
        failed++;
        // 404 or 410 = subscription expired/invalid → cleanup
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id);
        }
        logRows.push({
          user_id: userId,
          subscription_id: sub.id,
          endpoint_host: endpointHost(sub.endpoint),
          success: false,
          status_code: err?.statusCode ?? null,
          error_message: describePushError(err),
          tag: payload.tag ?? null,
        });
      }
    }
  );

  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from('push_delivery_log').insert(logRows);
    if (logErr) console.error('[push] delivery log insert failed:', logErr);
  }

  // Cleanup stale subscriptions
  if (staleIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', staleIds);
  }

  // Refresh last_used_at for active subscriptions so cleanup doesn't purge them
  if (sentIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', sentIds);
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
