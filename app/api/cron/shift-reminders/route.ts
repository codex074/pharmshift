export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds

import { NextRequest, NextResponse } from 'next/server';
import { sendPushToUsers, type NotificationPayload } from '@/lib/pushSender';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron-based shift reminder notifications
 *
 * Schedule (vercel.json):
 *   1) 01:00 UTC  = 08:00 Bangkok  →  remind today's shifts (EXCEPT รุ่งอรุณ)
 *   2) 11:00 UTC  = 18:00 Bangkok  →  remind tomorrow's shifts (ALL including รุ่งอรุณ)
 *
 * Only notifies users whose shifts are in published months.
 */

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Get current date/time in Bangkok timezone */
function getBangkokNow(): Date {
  // Create a date string in Bangkok timezone
  const now = new Date();
  const bangkokStr = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  return new Date(bangkokStr);
}

/** Format date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    // Verify cron secret (Vercel sets this automatically for cron jobs)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const bkkNow = getBangkokNow();
    const bkkHour = bkkNow.getHours();

    // Determine which date and which shift types to remind
    let targetDate: string;
    let excludeDawn = false; // exclude รุ่งอรุณ?
    let timeLabel: string;

    if (bkkHour >= 6 && bkkHour < 12) {
      // Morning run (08:00 BKK) → remind today's shifts, EXCEPT รุ่งอรุณ
      targetDate = toDateStr(bkkNow);
      excludeDawn = true;
      timeLabel = 'วันนี้';
    } else {
      // Evening run (18:00 BKK) → remind tomorrow's shifts (ALL)
      const tomorrow = new Date(bkkNow);
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = toDateStr(tomorrow);
      timeLabel = 'พรุ่งนี้';
    }

    const monthYear = toMonthYear(targetDate);

    // Check if this month is published for any role group
    const { data: publishFlags } = await supabase
      .from('role_publish_flags')
      .select('role, is_published')
      .eq('month_year', monthYear)
      .eq('is_published', true);

    if (!publishFlags || publishFlags.length === 0) {
      return NextResponse.json({
        ok: true,
        message: `No published schedules for ${monthYear}`,
        sent: 0,
      });
    }

    const publishedRoles = new Set(publishFlags.map((f: any) => f.role));

    // Get all shifts for the target date with user info via join
    let query = supabase
      .from('shifts')
      .select('shift_type, user_id, department:departments(name), user:users!inner(role)')
      .eq('month_year', monthYear)
      .eq('date', targetDate);

    if (excludeDawn) {
      query = query.neq('shift_type', 'รุ่งอรุณ');
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
      const dept = deptName ? ` (${deptName})` : '';
      const desc = `${label}${dept}`;
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
    const notifTitle = `⏰ ${timeLabel}คุณมีเวร`;

    // Insert in-app notifications (จากระบบ) for all users at once
    const notifRows = entries.map(([userId, shiftDescs]) => ({
      user_id: userId,
      type: 'shift_reminder',
      title: notifTitle,
      body: `${thaiDate} — ${shiftDescs.join(', ')}`,
      url: '/calendar',
    }));

    const { error: notifErr } = await supabase.from('notifications').insert(notifRows);
    if (notifErr) {
      console.error('[Shift Reminders] in-app notification insert error:', notifErr);
    } else {
      console.log(`[Shift Reminders] ✅ Inserted ${notifRows.length} in-app notification(s)`);
    }

    // Send push notifications
    await Promise.allSettled(
      entries.map(async ([userId, shiftDescs]) => {
        const shiftList = shiftDescs.join(', ');
        const payload: NotificationPayload = {
          title: notifTitle,
          body: `${thaiDate} — ${shiftList}`,
          url: '/calendar',
          tag: `reminder-${targetDate}`,
        };

        const result = await sendPushToUsers([userId], payload);
        totalSent += result.sent;
        totalFailed += result.failed;
      })
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
