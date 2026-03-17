import { NextRequest, NextResponse } from 'next/server';
import { sendPushToUser, sendPushToUsers, type NotificationPayload } from '@/lib/pushSender';

/** POST — Send push notification to user(s) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, userIds, title, body: msgBody, url, tag } = body;

    if (!title || !msgBody) {
      return NextResponse.json({ error: 'Missing title or body' }, { status: 400 });
    }

    const payload: NotificationPayload = {
      title,
      body: msgBody,
      url: url || '/calendar',
      tag: tag || 'general',
    };

    let result;

    if (userIds && Array.isArray(userIds)) {
      result = await sendPushToUsers(userIds, payload);
    } else if (userId) {
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
