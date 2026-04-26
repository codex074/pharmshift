export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Secured by CRON_SECRET — set this in Vercel Environment Variables
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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

  const { data: accepted, error: errFetch } = await supabase
    .from('swap_requests')
    .select('id, shift_id, created_at')
    .eq('status', 'accepted')
    .order('created_at', { ascending: true }); // oldest first

  if (errFetch) {
    console.error('[cron/cleanup] fetch accepted error:', errFetch);
  } else if (accepted && accepted.length > 0) {
    // Group by shift_id
    const byShift = new Map<string, { id: string; created_at: string }[]>();
    for (const req of accepted) {
      if (!byShift.has(req.shift_id)) byShift.set(req.shift_id, []);
      byShift.get(req.shift_id)!.push({ id: req.id, created_at: req.created_at });
    }

    const keepIds = new Set<string>();
    byShift.forEach((reqs) => {
      // Keep first (oldest) and last (newest) — delete everything in between
      keepIds.add(reqs[0].id);
      keepIds.add(reqs[reqs.length - 1].id);
    });

    const idsToDelete = accepted
      .filter(r => !keepIds.has(r.id))
      .map(r => r.id);

    if (idsToDelete.length > 0) {
      const { error: errChain, count } = await supabase
        .from('swap_requests')
        .delete({ count: 'exact' })
        .in('id', idsToDelete);

      if (errChain) console.error('[cron/cleanup] chain delete error:', errChain);
      else countChain = count ?? 0;
    }
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

  // ── 7) Delete push_subscriptions inactive for 3 months ─────────────────
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
    `[cron/cleanup] push_subscriptions: ${countPush ?? 0} inactive(>3mo)`,
  ].join('\n'));

  return NextResponse.json({
    ok: true,
    deleted_swap_requests_4w:       count4w      ?? 0,
    deleted_swap_requests_rejected: count48h     ?? 0,
    deleted_chain_hops:             countChain,
    deleted_reminder_notifs:        countReminder ?? 0,
    deleted_other_notifs:           countNotif   ?? 0,
    deleted_shift_logs:             countLogs    ?? 0,
    deleted_push_subscriptions:     countPush    ?? 0,
  });
}
