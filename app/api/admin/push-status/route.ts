export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: users, error: usersErr } = await supa
      .from('users')
      .select('id, pha_id, f_name, l_name, nickname, role')
      .eq('is_active', true);
    if (usersErr) throw usersErr;

    const { data: subs, error: subsErr } = await supa
      .from('push_subscriptions')
      .select('user_id, last_used_at');
    if (subsErr) throw subsErr;

    const byUser = new Map<string, { count: number; lastUsedAt: string | null }>();
    for (const sub of subs || []) {
      const entry = byUser.get(sub.user_id) || { count: 0, lastUsedAt: null };
      entry.count += 1;
      if (sub.last_used_at && (!entry.lastUsedAt || sub.last_used_at > entry.lastUsedAt)) {
        entry.lastUsedAt = sub.last_used_at;
      }
      byUser.set(sub.user_id, entry);
    }

    const roster = (users || []).map((u: any) => {
      const entry = byUser.get(u.id) || { count: 0, lastUsedAt: null };
      return {
        id: u.id,
        phaId: u.pha_id,
        name: [u.f_name, u.l_name].filter(Boolean).join(' ') || u.nickname || 'ไม่ทราบชื่อ',
        role: u.role,
        subscriptionCount: entry.count,
        lastUsedAt: entry.lastUsedAt,
      };
    });

    // No subscription first, then stalest last_used_at first — surfaces who
    // to chase at the top.
    roster.sort((a, b) => {
      if (a.subscriptionCount === 0 && b.subscriptionCount > 0) return -1;
      if (b.subscriptionCount === 0 && a.subscriptionCount > 0) return 1;
      return (a.lastUsedAt || '').localeCompare(b.lastUsedAt || '');
    });

    return NextResponse.json({ users: roster });
  } catch (error: any) {
    console.error('Admin push-status GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
