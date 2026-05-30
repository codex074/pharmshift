export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sendPushToUser, sendPushToUsers, type NotificationPayload } from '@/lib/pushSender';

const MAX_RECIPIENTS = 200;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;

/** POST — Send push notification to user(s) */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, userIds, title, body: msgBody, url, tag } = body;

    if (typeof title !== 'string' || typeof msgBody !== 'string' || !title.trim() || !msgBody.trim()) {
      return NextResponse.json({ error: 'Missing title or body' }, { status: 400 });
    }

    if (title.length > MAX_TITLE_LENGTH || msgBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: 'Notification payload is too large' }, { status: 413 });
    }

    const payload: NotificationPayload = {
      title,
      body: msgBody,
      url: url || '/calendar',
      tag: tag || 'general',
    };

    let result;

    if (userIds && Array.isArray(userIds)) {
      if (session.role !== 'admin' && !session.is_sub_admin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const uniqueUserIds = Array.from(new Set(userIds.filter((id) => typeof id === 'string' && id.trim())));
      if (uniqueUserIds.length === 0) {
        return NextResponse.json({ error: 'Missing userIds' }, { status: 400 });
      }
      if (uniqueUserIds.length > MAX_RECIPIENTS) {
        return NextResponse.json({ error: 'Too many recipients' }, { status: 413 });
      }

      result = await sendPushToUsers(uniqueUserIds, payload);
    } else if (userId) {
      if (typeof userId !== 'string') {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
      }
      result = await sendPushToUser(userId, payload);
    } else {
      return NextResponse.json({ error: 'Missing userId or userIds' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[Push Send] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
