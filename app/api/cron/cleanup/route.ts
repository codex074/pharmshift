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

  // 1) Delete swap_requests older than 2 months
  const cutoff2m = new Date();
  cutoff2m.setMonth(cutoff2m.getMonth() - 2);
  const cutoff2mISO = cutoff2m.toISOString();

  const { error: err2m, count: count2m } = await supabase
    .from('swap_requests')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff2mISO);

  if (err2m) {
    console.error('[cron/cleanup] swap_requests 2-month delete error:', err2m);
  }

  // 2) Delete rejected/cancelled swap_requests older than 1 day
  const cutoff1d = new Date();
  cutoff1d.setDate(cutoff1d.getDate() - 1);
  const cutoff1dISO = cutoff1d.toISOString();

  const { error: err1d, count: count1d } = await supabase
    .from('swap_requests')
    .delete({ count: 'exact' })
    .eq('status', 'rejected')
    .lt('created_at', cutoff1dISO);

  if (err1d) {
    console.error('[cron/cleanup] swap_requests rejected 1-day delete error:', err1d);
  }

  console.log(`[cron/cleanup] Deleted ${count2m ?? 0} old (>2mo) + ${count1d ?? 0} rejected (>1d) swap_requests`);

  // 3) Delete shift_reminder notifications older than 12 hours
  const cutoff12h = new Date();
  cutoff12h.setHours(cutoff12h.getHours() - 12);
  const cutoff12hISO = cutoff12h.toISOString();

  const { error: errReminder, count: countReminder } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('type', 'shift_reminder')
    .lt('created_at', cutoff12hISO);

  if (errReminder) {
    console.error('[cron/cleanup] notifications shift_reminder 12h delete error:', errReminder);
  }

  // 4) Delete all other notifications older than 1 week
  const cutoff1w = new Date();
  cutoff1w.setDate(cutoff1w.getDate() - 7);
  const cutoff1wISO = cutoff1w.toISOString();

  const { error: errNotif, count: countNotif } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .neq('type', 'shift_reminder')
    .lt('created_at', cutoff1wISO);

  if (errNotif) {
    console.error('[cron/cleanup] notifications 1-week delete error:', errNotif);
  }

  console.log(
    `[cron/cleanup] Deleted ${countReminder ?? 0} shift_reminder (>12h) + ${countNotif ?? 0} other notifications (>1w)`
  );

  return NextResponse.json({
    ok: true,
    deleted_old: count2m ?? 0,
    deleted_rejected: count1d ?? 0,
    cutoff_2months: cutoff2mISO,
    cutoff_1day: cutoff1dISO,
    deleted_reminder_notifs: countReminder ?? 0,
    deleted_other_notifs: countNotif ?? 0,
    cutoff_12h: cutoff12hISO,
    cutoff_1week: cutoff1wISO,
  });
}
