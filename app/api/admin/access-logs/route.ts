export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import type { UserRole } from '@/lib/types';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ROLE_VALUES: UserRole[] = ['pharmacist', 'pharmacy_technician', 'officer', 'admin'];

function isUserRole(value: string): value is UserRole {
  return ROLE_VALUES.includes(value as UserRole);
}

function parseLimit(value: string | null) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(10, Math.min(100, Math.floor(parsed)));
}

// Accepts YYYY-MM-DD
function isValidDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getUserIdsForRole(role: UserRole) {
  const { data, error } = await supa.from('users').select('id').eq('role', role);
  if (error) throw error;
  return (data || []).map((u: any) => u.id).filter(Boolean) as string[];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const limit = parseLimit(searchParams.get('limit'));
    const roleParam = searchParams.get('role');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const cursor = searchParams.get('cursor'); // last_seen_at ISO of the last row

    if (roleParam && roleParam !== 'all' && !isUserRole(roleParam)) {
      return NextResponse.json({ error: 'ตัวกรอง role ไม่ถูกต้อง' }, { status: 400 });
    }
    if ((fromParam && !isValidDay(fromParam)) || (toParam && !isValidDay(toParam))) {
      return NextResponse.json({ error: 'ตัวกรองวันที่ไม่ถูกต้อง' }, { status: 400 });
    }
    if (isValidDay(fromParam) && isValidDay(toParam) && fromParam > toParam) {
      return NextResponse.json({ error: 'ช่วงวันที่ไม่ถูกต้อง' }, { status: 400 });
    }

    const role: UserRole | null = roleParam && roleParam !== 'all' ? (roleParam as UserRole) : null;
    const userIds = role ? await getUserIdsForRole(role) : null;
    if (role && userIds?.length === 0) {
      return NextResponse.json({ logs: [], nextCursor: null });
    }

    let query = supa
      .from('access_logs')
      .select('id, user_id, day, first_seen_at, last_seen_at, hit_count, user:users(f_name, nickname, role)')
      .order('last_seen_at', { ascending: false })
      .limit(limit + 1);

    if (userIds) query = query.in('user_id', userIds);
    if (isValidDay(fromParam)) query = query.gte('day', fromParam);
    if (isValidDay(toParam)) query = query.lte('day', toParam);
    if (cursor) query = query.lt('last_seen_at', cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const hasMore = rows.length > limit;
    const logs = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      user_name: row.user?.f_name || row.user?.nickname || 'ไม่ทราบผู้ใช้',
      user_role: (row.user?.role as UserRole | null) || null,
      day: row.day,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      hit_count: row.hit_count,
    }));

    const nextCursor = hasMore ? logs[logs.length - 1]?.last_seen_at : null;
    return NextResponse.json({ logs, nextCursor });
  } catch (err: any) {
    console.error('Admin access logs GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
