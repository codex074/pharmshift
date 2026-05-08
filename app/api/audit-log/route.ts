export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { writeAuditLogs } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { events } = await request.json();
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'events is required' }, { status: 400 });
    }

    await writeAuditLogs(
      events
        .filter((event: any) => event?.action && event?.description)
        .map((event: any) => ({
          actorUserId: session.id,
          action: String(event.action),
          description: String(event.description),
        }))
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[audit] api error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
