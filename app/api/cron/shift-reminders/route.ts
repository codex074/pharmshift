export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds

import { NextRequest, NextResponse } from 'next/server';
import { sendPushToUsers, limitedAllSettled, type NotificationPayload } from '@/lib/pushSender';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron-based shift reminder notifications
 *
 * Schedule (GitHub Actions cron):
 *   1) 23:00 UTC  = 06:00 Bangkok  →  remind today's shifts (EXCEPT รุ่งอรุณ)
 *   2) 09:00 UTC  = 16:00 Bangkok  →  remind tomorrow's shifts (ALL including รุ่งอรุณ)
 *   3) 09:00 UTC  = 16:00 Bangkok  →  remind tonight's night shift only
 *
 * Only notifies users whose shifts are in published months.
 */

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Get current date parts in Bangkok timezone (UTC+7) */
function getBangkokNow(): { year: number; month: number; day: number; hour: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),   // 1-12
    day: get('day'),
    hour: get('hour') % 24, // hour12:false may return 24 for midnight
  };
}

/** Get YYYY-MM from date for month_year publish check */
function toMonthYear(dateStr: string): string {
  return dateStr.substring(0, 7); // "YYYY-MM"
}

const SHIFT_TYPE_LABELS: Record<string, string> = {
  'เช้า': 'เวรเช้า',
  'บ่าย': 'เวรบ่าย',
  'ดึก': 'เวรดึก',
  'รุ่งอรุณ': 'เวรรุ่งอรุณ',
  'smc': 'เวร SMC',
};

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret. GitHub Actions sends this as a Bearer token.
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production') {
      if (!cronSecret) {
        console.error('[cron/shift-reminders] CRON_SECRET is not configured');
        return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 500 });
      }
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getSupabaseAdmin();
    const bkk = getBangkokNow();
    // "run" param is set explicitly by GitHub Actions workflow (morning / evening / night).
    // "testRun" is the legacy admin-test override (same values).
    const runParam = req.nextUrl.searchParams.get('run')
      ?? req.nextUrl.searchParams.get('testRun')
      ?? req.headers.get('x-test-run');

    if (runParam !== 'morning' && runParam !== 'evening' && runParam !== 'night') {
      return NextResponse.json({ error: 'Missing required param: run=morning|evening|night' }, { status: 400 });
    }

    // Determine which date and which shift types to remind
    let targetDate: string;
    let excludeDawn = false; // exclude รุ่งอรุณ?
    let timeLabel: string;
    const isNightRun = runParam === 'night';

    if (runParam === 'morning') {
      // Morning run (06:00 BKK) → remind today's shifts, EXCEPT รุ่งอรุณ
      targetDate = `${bkk.year}-${String(bkk.month).padStart(2, '0')}-${String(bkk.day).padStart(2, '0')}`;
      excludeDawn = true;
      timeLabel = 'วันนี้';
    } else if (runParam === 'night') {
      // Night run (16:00 BKK) → remind tonight's night shift only
      targetDate = `${bkk.year}-${String(bkk.month).padStart(2, '0')}-${String(bkk.day).padStart(2, '0')}`;
      timeLabel = 'คืนนี้';
    } else {
      // Evening run (16:00 BKK) → remind tomorrow's shifts (ALL)
      const todayUTC = Date.UTC(bkk.year, bkk.month - 1, bkk.day);
      const tomorrowUTC = todayUTC + 24 * 60 * 60 * 1000;
      const t = new Date(tomorrowUTC);
      targetDate = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
      timeLabel = 'พรุ่งนี้';
    }

    const monthYear = toMonthYear(targetDate);

    // Check if this month is published for any role group
    // The actual table is `published_months` with per-role boolean columns
    const { data: publishData } = await supabase
      .from('published_months')
      .select('is_published, pharmacist_published, pharmacy_technician_published, officer_published')
      .eq('month_year', monthYear)
      .maybeSingle();

    // Build set of published roles from the per-role flags
    const publishedRoles = new Set<string>();
    if (publishData) {
      if (publishData.pharmacist_published || publishData.is_published) publishedRoles.add('pharmacist');
      if (publishData.pharmacy_technician_published || publishData.is_published) publishedRoles.add('pharmacy_technician');
      if (publishData.officer_published || publishData.is_published) publishedRoles.add('officer');
    }

    if (publishedRoles.size === 0) {
      return NextResponse.json({
        ok: true,
        message: `No published schedules for ${monthYear}`,
        sent: 0,
      });
    }

    // Get all shifts for the target date with user info via join
    let query = supabase
      .from('shifts')
      .select('shift_type, position, user_id, department:departments(name), user:users!user_id(role)')
      .eq('month_year', monthYear)
      .eq('date', targetDate);

    if (excludeDawn) {
      query = query.neq('shift_type', 'รุ่งอรุณ');
    }
    if (isNightRun) {
      query = query.eq('shift_type', 'ดึก');
    }

    const { data: shifts, error: shiftsErr } = await query;

    if (shiftsErr) throw shiftsErr;
    if (!shifts || shifts.length === 0) {
      return NextResponse.json({
        ok: true,
        message: `No shifts on ${targetDate}`,
        sent: 0,
      });
    }

    // Filter shifts to only published role groups
    const filteredShifts = shifts.filter((s: any) => {
      const userRole = (s.user as any)?.role;
      return userRole && publishedRoles.has(userRole);
    });

    if (filteredShifts.length === 0) {
      return NextResponse.json({
        ok: true,
        message: `No shifts for published roles on ${targetDate}`,
        sent: 0,
      });
    }

    // Group by user_id → collect their shift info
    const userShifts = new Map<string, string[]>();
    for (const s of filteredShifts) {
      if (!s.user_id) continue;
      const label = SHIFT_TYPE_LABELS[s.shift_type] || s.shift_type;
      const deptName = (s.department as any)?.name;
      // รุ่งอรุณ: ห้อง (ER/OPD/HIV) เก็บใน position ไม่ใช่ department (dept = ชื่อเดียวกับ shift_type)
      const detail = s.shift_type === 'รุ่งอรุณ' && s.position
        ? ` (${s.position})`
        : deptName && deptName !== s.shift_type ? ` (${deptName})` : '';
      const desc = isNightRun ? 'เวรดึก' : `${label}${detail}`;
      const existing = userShifts.get(s.user_id) || [];
      existing.push(desc);
      userShifts.set(s.user_id, existing);
    }

    if (userShifts.size === 0) {
      return NextResponse.json({ ok: true, message: 'No users to notify', sent: 0 });
    }

    // Format Thai date for display
    const [y, m, d] = targetDate.split('-');
    const thaiDate = `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;

    // Send notifications grouped by user
    let totalSent = 0;
    let totalFailed = 0;

    const entries = Array.from(userShifts.entries());
    const notifTitle = isNightRun ? 'คืนนี้คุณมีเวรดึก' : `⏰ ${timeLabel}คุณมีเวร`;
    const buildBody = (shiftDescs: string[]) =>
      isNightRun ? 'คืนนี้คุณมีเวรดึก' : `${thaiDate} — ${shiftDescs.join(', ')}`;

    // Insert in-app notifications (จากระบบ) for all users at once
    const notifRows = entries.map(([userId, shiftDescs]) => ({
      user_id: userId,
      type: 'shift_reminder',
      title: notifTitle,
      body: buildBody(shiftDescs),
      url: '/calendar',
    }));

    const { error: notifErr } = await supabase.from('notifications').insert(notifRows);
    if (notifErr) {
      console.error('[Shift Reminders] in-app notification insert error:', notifErr);
    } else {
      console.log(`[Shift Reminders] ✅ Inserted ${notifRows.length} in-app notification(s)`);
    }

    // Send push notifications — bounded concurrency so a large roster can't
    // fan out into hundreds of simultaneous requests and blow the cron's
    // maxDuration cap.
    await limitedAllSettled(
      entries,
      10,
      async ([userId, shiftDescs]) => {
        const payload: NotificationPayload = {
          title: notifTitle,
          body: buildBody(shiftDescs),
          url: '/calendar',
          tag: `reminder-${runParam}-${targetDate}`,
        };

        const result = await sendPushToUsers([userId], payload);
        totalSent += result.sent;
        totalFailed += result.failed;
      }
    );

    return NextResponse.json({
      ok: true,
      targetDate,
      timeLabel,
      usersNotified: userShifts.size,
      inAppInserted: notifRows.length,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (err: any) {
    console.error('[Shift Reminders] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
