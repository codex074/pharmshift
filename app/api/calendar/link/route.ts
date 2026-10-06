export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createFeedToken } from '@/lib/icalFeed';

/** Returns the caller's personal iCal subscription URL. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const url = `${origin}/api/calendar/feed/${createFeedToken(session.id)}.ics`;
  return NextResponse.json({ url });
}
