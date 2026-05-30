export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

/**
 * Admin-only endpoint to trigger shift reminders manually for testing.
 * POST /api/cron/test-reminders
 * Body: { "run": "morning" | "evening" | "night" }
 *   morning = simulate 06:00 run (today's shifts, except รุ่งอรุณ)
 *   evening = simulate 16:00 run (tomorrow's shifts, all types)
 *   night   = simulate 16:00 run (tonight's night shift only)
 */
export async function POST(req: NextRequest) {
  // Auth check — admin only
  const session = await getSession();
  if (!session?.id || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const run: 'morning' | 'evening' | 'night' =
    body.run === 'morning' || body.run === 'night' ? body.run : 'evening';

  // Call the real cron endpoint internally, passing testRun header
  const origin = req.headers.get('origin') ?? req.headers.get('host') ?? 'localhost:3000';
  const protocol = origin.startsWith('localhost') || origin.startsWith('127.') ? 'http' : 'https';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${origin}`;

  const cronUrl = `${baseUrl}/api/cron/shift-reminders`;

  const cronRes = await fetch(cronUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET ?? '__dev__'}`,
      'x-test-run': run,
    },
    cache: 'no-store',
  });

  const data = await cronRes.json();
  return NextResponse.json({ triggeredAs: run, ...data }, { status: cronRes.status });
}
