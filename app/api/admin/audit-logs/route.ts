export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseLimit(value: string | null) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(10, Math.min(100, Math.floor(parsed)));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function collectUuidStrings(value: unknown, out: Set<string>) {
  if (!value) return;
  if (typeof value === 'string') {
    if (UUID_RE.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUuidStrings(item, out));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectUuidStrings(item, out));
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const limit = parseLimit(searchParams.get('limit'));
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const cursor = searchParams.get('cursor');

    let query = supa
      .from('audit_logs')
      .select(`
        id,
        actor_user_id,
        actor_snapshot,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data,
        metadata,
        ip_address,
        user_agent,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (action && action !== 'all') query = query.eq('action', action);
    if (entityType && entityType !== 'all') query = query.eq('entity_type', entityType);
    if (cursor) query = query.lt('created_at', cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const hasMore = rows.length > limit;
    const logs = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? logs[logs.length - 1]?.created_at : null;

    const userIds = new Set<string>();
    logs.forEach((log: any) => {
      collectUuidStrings(log.actor_user_id, userIds);
      collectUuidStrings(log.before_data, userIds);
      collectUuidStrings(log.after_data, userIds);
      collectUuidStrings(log.metadata, userIds);
    });

    let userMap: Record<string, any> = {};
    if (userIds.size) {
      const { data: users, error: usersErr } = await supa
        .from('users')
        .select('id, pha_id, prefix, f_name, l_name, nickname, role')
        .in('id', Array.from(userIds));
      if (usersErr) throw usersErr;
      userMap = Object.fromEntries((users || []).map((user: any) => [user.id, user]));
    }

    return NextResponse.json({ logs, nextCursor, userMap });
  } catch (err: any) {
    console.error('Admin audit logs GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
