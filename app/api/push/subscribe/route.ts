export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMobileUserAgent } from '@/lib/deviceDetection';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** POST — Save push subscription for a user */
export async function POST(req: NextRequest) {
  try {
    const { userId, subscription } = await req.json();
    const userAgent = req.headers.get('user-agent');

    if (!userId || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isMobileUserAgent(userAgent)) {
      return NextResponse.json({ error: 'Push subscription is allowed only on mobile devices' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Upsert — if same endpoint already exists, update keys
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: userAgent || null,
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[Push Subscribe] DB error:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Push Subscribe] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE — Remove push subscription */
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Push Unsubscribe] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
