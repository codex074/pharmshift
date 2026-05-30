export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';

/** Service-role client — bypasses RLS and GRANT restrictions for raw-SQL tables */
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** GET /api/notifications — return current user's notifications (newest first) */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) return NextResponse.json({ notifications: [] });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, is_read, url, created_at')
      .eq('user_id', session.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[GET /api/notifications] query error:', error);
      throw error;
    }
    return NextResponse.json({ notifications: data || [] });
  } catch (err: any) {
    console.error('[GET /api/notifications] error:', err);
    return NextResponse.json({ notifications: [], error: err.message }, { status: 500 });
  }
}

/** POST /api/notifications — insert in-app notifications for a list of users */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      console.warn('[POST /api/notifications] No session — returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userIds, type, title, body, url } = await req.json();
    const ids = (userIds as string[] | undefined)?.filter(Boolean) ?? [];
    if (!ids.length || !type || !title || !body) {
      console.warn('[POST /api/notifications] Missing fields:', { ids: ids.length, type, title: !!title, body: !!body });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (ids.length > 300) {
      return NextResponse.json({ error: 'Too many recipients' }, { status: 413 });
    }

    const supabase = getSupabaseAdmin();
    const rows = ids.map((uid) => ({ user_id: uid, type, title, body, url: url || '/calendar' }));
    const { error } = await supabase.from('notifications').insert(rows);

    if (error) {
      console.error('[POST /api/notifications] insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[POST /api/notifications] ✅ Inserted ${rows.length} notification(s) for users: ${ids.join(', ')}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[POST /api/notifications] error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/** PUT /api/notifications — mark all unread notifications as read for current user */
export async function PUT() {
  try {
    const session = await getSession();
    if (!session?.id) return NextResponse.json({ success: false }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.id)
      .eq('is_read', false);

    if (error) {
      console.error('[PUT /api/notifications] update error:', error);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
