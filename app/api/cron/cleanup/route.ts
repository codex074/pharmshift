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

  // ── 1) Delete swap_requests older than 3 months ────────────────────────
  const cutoff3mSwap = new Date();
  cutoff3mSwap.setMonth(cutoff3mSwap.getMonth() - 3);

  const { error: err4w, count: count4w } = await supabase
    .from('swap_requests')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff3mSwap.toISOString());

  if (err4w) console.error('[cron/cleanup] swap_requests 3-month delete error:', err4w);

  // ── 2) Delete rejected swap_requests older than 3 months ───────────────
  const cutoff3mRejected = new Date();
  cutoff3mRejected.setMonth(cutoff3mRejected.getMonth() - 3);

  const { error: err48h, count: count48h } = await supabase
    .from('swap_requests')
    .delete({ count: 'exact' })
    .eq('status', 'rejected')
    .lt('updated_at', cutoff3mRejected.toISOString());

  if (err48h) console.error('[cron/cleanup] swap_requests rejected 48h delete error:', err48h);

  // ── 3) Clean up multi-hop accepted swaps ───────────────────────────────
  // For each shift with 3+ accepted swaps, keep only:
  //   • the OLDEST (original swap — who first gave it away)
  //   • the NEWEST (latest swap — who gave it to the current owner)
  // All intermediate hops are deleted to save space.
  let countChain = 0;

  const { data: chainDeleted, error: errChain } = await supabase
    .rpc('cleanup_swap_request_chain_hops', { p_limit: 1000 });

  if (errChain) {
    console.error('[cron/cleanup] chain-hop RPC error:', errChain);
  } else {
    countChain = Number(chainDeleted ?? 0);
  }

  // ── 4) Delete shift_reminder notifications older than 12 hours ─────────
  const cutoff12h = new Date();
  cutoff12h.setHours(cutoff12h.getHours() - 12);

  const { error: errReminder, count: countReminder } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('type', 'shift_reminder')
    .lt('created_at', cutoff12h.toISOString());

  if (errReminder) console.error('[cron/cleanup] notifications shift_reminder 12h delete error:', errReminder);

  // ── 5) Delete all other notifications older than 3 days ────────────────
  const cutoff3d = new Date();
  cutoff3d.setDate(cutoff3d.getDate() - 3);

  const { error: errNotif, count: countNotif } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .neq('type', 'shift_reminder')
    .lt('created_at', cutoff3d.toISOString());

  if (errNotif) console.error('[cron/cleanup] notifications 3-day delete error:', errNotif);

  // ── 6) Delete shift_logs older than 3 months ───────────────────────────
  const cutoff3m = new Date();
  cutoff3m.setMonth(cutoff3m.getMonth() - 3);

  const { error: errLogs, count: countLogs } = await supabase
    .from('shift_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff3m.toISOString());

  if (errLogs) console.error('[cron/cleanup] shift_logs 3-month delete error:', errLogs);

  // ── 7) Delete audit_logs older than 3 months ───────────────────────────
  const { error: errAuditLogs, count: countAuditLogs } = await supabase
    .from('audit_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff3m.toISOString());

  if (errAuditLogs) console.error('[cron/cleanup] audit_logs 3-month delete error:', errAuditLogs);

  // ── 8) Delete push_subscriptions inactive for 3 months ─────────────────
  const cutoff60d = new Date();
  cutoff60d.setMonth(cutoff60d.getMonth() - 3);

  const { error: errPush, count: countPush } = await supabase
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff60d.toISOString());

  if (errPush) console.error('[cron/cleanup] push_subscriptions 60-day delete error:', errPush);

  console.log([
    `[cron/cleanup] swap_requests: ${count4w ?? 0} old(>3mo) | ${count48h ?? 0} rejected(>3mo) | ${countChain} chain-hops`,
    `[cron/cleanup] notifications: ${countReminder ?? 0} reminders(>12h) | ${countNotif ?? 0} others(>3d)`,
    `[cron/cleanup] shift_logs: ${countLogs ?? 0} old(>3mo)`,
    `[cron/cleanup] audit_logs: ${countAuditLogs ?? 0} old(>3mo)`,
    `[cron/cleanup] push_subscriptions: ${countPush ?? 0} inactive(>3mo)`,
  ].join('\n'));

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    deleted_swap_requests_4w:       count4w      ?? 0,
    deleted_swap_requests_rejected: count48h     ?? 0,
    deleted_chain_hops:             countChain,
    deleted_reminder_notifs:        countReminder ?? 0,
    deleted_other_notifs:           countNotif   ?? 0,
    deleted_shift_logs:             countLogs    ?? 0,
    deleted_audit_logs:             countAuditLogs ?? 0,
    deleted_push_subscriptions:     countPush    ?? 0,
  });
}
