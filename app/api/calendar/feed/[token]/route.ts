export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resilientFetch } from '@/lib/resilientFetch';
import { buildIcs, verifyFeedToken, type FeedShift } from '@/lib/icalFeed';
import { userDisplayName } from '@/lib/types';

const PAST_DAYS = 60;
const FUTURE_DAYS = 180;

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: { fetch: resilientFetch },
  });
}

function bangkokDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d); // YYYY-MM-DD
}

/**
 * Public, token-authenticated iCal feed of one user's shifts (calendar apps send no cookies).
 * Only months published for the user's role are included, matching what the app shows.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const userId = verifyFeedToken(params.token);
  if (!userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('users')
      .select('id, role, nickname, f_name, is_active')
      .eq('id', userId)
      .single();
    if (!user || !user.is_active) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: shifts, error } = await supabase
      .from('shifts')
      .select('id, date, shift_type, position, month_year, department:departments(name)')
      .eq('user_id', userId)
      .gte('date', bangkokDate(-PAST_DAYS))
      .lte('date', bangkokDate(FUTURE_DAYS))
      .order('date', { ascending: true });
    if (error) throw error;

    const months = Array.from(new Set((shifts ?? []).map((s) => s.month_year)));
    const published = new Set<string>();
    if (months.length) {
      const { data: pub, error: pubErr } = await supabase
        .from('published_months')
        .select('month_year, is_published, pharmacist_published, pharmacy_technician_published, officer_published')
        .in('month_year', months);
      if (pubErr) throw pubErr;
      for (const p of pub ?? []) {
        const roleFlag = (p as Record<string, unknown>)[`${user.role}_published`];
        if ((roleFlag ?? p.is_published) === true) published.add(p.month_year);
      }
    }

    const visible = (shifts ?? []).filter((s) => published.has(s.month_year)) as unknown as FeedShift[];
    const body = buildIcs(visible, { role: user.role, calName: `เวรดี๊ดี — ${userDisplayName(user)}` });

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="pharmshift.ics"',
        'Cache-Control': 'private, max-age=900',
      },
    });
  } catch (err) {
    console.error('[calendar/feed] failed:', err);
    return NextResponse.json({ error: 'Failed to build calendar' }, { status: 500 });
  }
}
