export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function verifyCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/cleanup] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();

  // swap_requests are kept forever (2026-08-01, by request) — they back
  // ShiftProvenance's "ที่มาของเวร" lookup and the admin shift-history view,
  // both of which query swap_requests by shift_id. The old 3-month purge +
  // chain-hop dedup (cleanup_swap_request_chain_hops RPC, still defined in
  // the DB but no longer called here) silently blanked shift history once
  // it aged out. See README.md cron table.

  const cutoff3m = new Date(); // used by the audit_logs delete below
  cutoff3m.setMonth(cutoff3m.getMonth() - 3);

  // ── Delete shift_reminder notifications older than 12 hours ────────────
  const cutoff12h = new Date();
  cutoff12h.setHours(cutoff12h.getHours() - 12);

  const { error: errReminder, count: countReminder } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('type', 'shift_reminder')
    .lt('created_at', cutoff12h.toISOString());

  if (errReminder) console.error('[cron/cleanup] notifications shift_reminder 12h delete error:', errReminder);

  // ── Delete all other notifications older than 3 days ───────────────────
  const cutoff3d = new Date();
  cutoff3d.setDate(cutoff3d.getDate() - 3);

  const { error: errNotif, count: countNotif } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .neq('type', 'shift_reminder')
    .lt('created_at', cutoff3d.toISOString());

  if (errNotif) console.error('[cron/cleanup] notifications 3-day delete error:', errNotif);

  // ── Delete audit_logs older than 3 months ───────────────────────────────
  const { error: errAuditLogs, count: countAuditLogs } = await supabase
    .from('audit_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff3m.toISOString());

  if (errAuditLogs) console.error('[cron/cleanup] audit_logs 3-month delete error:', errAuditLogs);

  // ── Delete push_subscriptions inactive for 3 months ─────────────────────
  const cutoff3mPush = new Date();
  cutoff3mPush.setMonth(cutoff3mPush.getMonth() - 3);

  const { error: errPush, count: countPush } = await supabase
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .not('last_used_at', 'is', null)
    .lt('last_used_at', cutoff3mPush.toISOString());

  if (errPush) console.error('[cron/cleanup] push_subscriptions 60-day delete error:', errPush);

  // ── Delete push_delivery_log older than 3 months ────────────────────────
  const { error: errPushLog, count: countPushLog } = await supabase
    .from('push_delivery_log')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff3m.toISOString());

  if (errPushLog) console.error('[cron/cleanup] push_delivery_log 3-month delete error:', errPushLog);

  console.log([
    `[cron/cleanup] notifications: ${countReminder ?? 0} reminders(>12h) | ${countNotif ?? 0} others(>3d)`,
    `[cron/cleanup] audit_logs: ${countAuditLogs ?? 0} old(>3mo)`,
    `[cron/cleanup] push_subscriptions: ${countPush ?? 0} inactive(>3mo)`,
    `[cron/cleanup] push_delivery_log: ${countPushLog ?? 0} old(>3mo)`,
  ].join('\n'));

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    deleted_reminder_notifs:        countReminder ?? 0,
    deleted_other_notifs:           countNotif   ?? 0,
    deleted_audit_logs:             countAuditLogs ?? 0,
    deleted_push_subscriptions:     countPush    ?? 0,
    deleted_push_delivery_log:      countPushLog ?? 0,
  });
}
