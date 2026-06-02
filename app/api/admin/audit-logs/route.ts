export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import type { UserRole } from '@/lib/types';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type LegacyAuditRow = {
  id: string;
  actor_user_id?: string | null;
  actor_snapshot?: {
    f_name?: string | null;
    nickname?: string | null;
    role?: UserRole | null;
  } | null;
  action: string;
  entity_type?: string | null;
  before_data?: { request_type?: string | null } | null;
  after_data?: { request_type?: string | null } | null;
  metadata?: { description?: string | null } | null;
  created_at: string;
};

const SWAP_ACTIONS = new Set(['request_swap', 'request_cover', 'request_transfer']);

type AuditLogResponse = {
  id: string;
  actor_name: string;
  actor_role: UserRole | null;
  action: string;
  description: string;
  created_at: string;
  swap_status?: 'pending' | 'accepted' | 'rejected' | null;
};

const ROLE_VALUES: UserRole[] = ['pharmacist', 'pharmacy_technician', 'officer', 'admin'];

function parseLimit(value: string | null) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(10, Math.min(100, Math.floor(parsed)));
}

function isUserRole(value: string): value is UserRole {
  return ROLE_VALUES.includes(value as UserRole);
}

function parseDateFilter(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function getActorIdsForRole(role: UserRole) {
  const { data, error } = await supa
    .from('users')
    .select('id')
    .eq('role', role);

  if (error) throw error;
  return (data || []).map((user: any) => user.id).filter(Boolean) as string[];
}

function normalizeLegacyAction(row: LegacyAuditRow) {
  const requestType = row.after_data?.request_type || row.before_data?.request_type;

  if (row.action === 'login' || row.action === 'login_success') return 'login';
  if (row.action === 'export_report') return 'export_report';
  if (row.action === 'publish_schedule' || row.entity_type === 'published_months') return 'publish_schedule';
  if (row.action === 'add_shift' || (row.entity_type === 'shifts' && row.action === 'insert')) return 'add_shift';
  if (row.action === 'edit_shift' || (row.entity_type === 'shifts' && row.action === 'update')) return 'edit_shift';
  if (row.action === 'delete_shift' || (row.entity_type === 'shifts' && row.action === 'delete')) return 'delete_shift';
  if (row.action === 'request_swap' || requestType === 'swap') return 'request_swap';
  if (row.action === 'request_cover' || requestType === 'cover') return 'request_cover';
  if (row.action === 'request_transfer' || requestType === 'transfer') return 'request_transfer';

  return row.action;
}

function actorNameFromSnapshot(snapshot?: LegacyAuditRow['actor_snapshot']) {
  if (!snapshot) return 'ระบบ';
  return snapshot.f_name || snapshot.nickname || 'ไม่ทราบผู้ใช้';
}

function roleFromSnapshot(snapshot?: LegacyAuditRow['actor_snapshot']) {
  return snapshot?.role || null;
}

function normalizeLegacyDescription(row: LegacyAuditRow) {
  return row.metadata?.description || '';
}

async function enrichSwapStatus<T extends { action: string; entity_id?: string | null }>(logs: T[]): Promise<(T & { swap_status?: 'pending' | 'accepted' | 'rejected' | null })[]> {
  const ids = logs
    .filter((log) => SWAP_ACTIONS.has(log.action) && log.entity_id)
    .map((log) => log.entity_id as string);

  if (!ids.length) return logs.map((log) => ({ ...log, swap_status: undefined }));

  const { data } = await supa
    .from('swap_requests')
    .select('id, status')
    .in('id', ids);

  const statusMap = new Map((data || []).map((row: any) => [row.id, row.status]));

  return logs.map((log) => {
    if (!SWAP_ACTIONS.has(log.action)) return { ...log, swap_status: undefined };
    if (!log.entity_id) return { ...log, swap_status: null };
    const status = statusMap.get(log.entity_id);
    return { ...log, swap_status: status ?? null };
  });
}

async function enrichActorInfo<T extends { actor_user_id?: string | null; actor_name: string; actor_role?: UserRole | null }>(logs: T[]) {
  const actorIds = Array.from(new Set(logs.map((log) => log.actor_user_id).filter(Boolean))) as string[];
  if (!actorIds.length) return logs;

  const { data: users } = await supa
    .from('users')
    .select('id, f_name, role')
    .in('id', actorIds);

  const userMap = new Map((users || []).map((user: any) => [user.id, user]));

  return logs.map((log) => {
    const actor = log.actor_user_id ? userMap.get(log.actor_user_id) : null;
    return {
      ...log,
      actor_name: actor?.f_name || log.actor_name,
      actor_role: actor?.role || log.actor_role || null,
    };
  });
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
    const roleParam = searchParams.get('role');
    const cursor = searchParams.get('cursor');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const from = parseDateFilter(fromParam);
    const to = parseDateFilter(toParam);

    if (roleParam && roleParam !== 'all' && !isUserRole(roleParam)) {
      return NextResponse.json({ error: 'ตัวกรอง role ไม่ถูกต้อง' }, { status: 400 });
    }

    if ((fromParam && !from) || (toParam && !to)) {
      return NextResponse.json({ error: 'ตัวกรองวันที่ไม่ถูกต้อง' }, { status: 400 });
    }

    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      return NextResponse.json({ error: 'ช่วงวันที่ไม่ถูกต้อง' }, { status: 400 });
    }

    const role: UserRole | null = roleParam && roleParam !== 'all' ? (roleParam as UserRole) : null;
    const actorIds = role ? await getActorIdsForRole(role) : null;

    if (role && actorIds?.length === 0) {
      return NextResponse.json({ logs: [], nextCursor: null });
    }

    let simpleQuery = supa
      .from('audit_logs')
      .select('id, actor_user_id, actor_name, action, description, entity_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (action && action !== 'all') simpleQuery = simpleQuery.eq('action', action);
    if (actorIds) simpleQuery = simpleQuery.in('actor_user_id', actorIds);
    if (from) simpleQuery = simpleQuery.gte('created_at', from);
    if (to) simpleQuery = simpleQuery.lte('created_at', to);
    if (cursor) simpleQuery = simpleQuery.lt('created_at', cursor);

    const simpleResult = await simpleQuery;

    if (!simpleResult.error) {
      const rows = simpleResult.data || [];
      const hasMore = rows.length > limit;
      const mapped = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => ({
        ...row,
        actor_name: row.actor_name || 'ระบบ',
        actor_role: null,
        description: row.description || actionLabelFallback(row.action),
      }));
      const enriched = await enrichActorInfo(mapped);
      const logs = await enrichSwapStatus(enriched);
      const nextCursor = hasMore ? logs[logs.length - 1]?.created_at : null;
      return NextResponse.json({ logs, nextCursor });
    }

    let legacyQuery = supa
      .from('audit_logs')
      .select('id, actor_user_id, actor_snapshot, action, entity_type, before_data, after_data, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) legacyQuery = legacyQuery.lt('created_at', cursor);
    if (actorIds) legacyQuery = legacyQuery.in('actor_user_id', actorIds);
    if (from) legacyQuery = legacyQuery.gte('created_at', from);
    if (to) legacyQuery = legacyQuery.lte('created_at', to);

    const legacyResult = await legacyQuery;
    if (legacyResult.error) throw simpleResult.error;

    let logs = (legacyResult.data || []).map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      actor_name: actorNameFromSnapshot(row.actor_snapshot),
      actor_role: roleFromSnapshot(row.actor_snapshot),
      action: normalizeLegacyAction(row as LegacyAuditRow),
      description: normalizeLegacyDescription(row as LegacyAuditRow) || actionLabelFallback(normalizeLegacyAction(row as LegacyAuditRow)),
      created_at: row.created_at,
    }));

    logs = await enrichActorInfo(logs);

    if (action && action !== 'all') {
      logs = logs.filter((row) => row.action === action);
    }

    if (role) {
      logs = logs.filter((row) => row.actor_role === role);
    }

    const hasMore = logs.length > limit;
    const slicedLogs = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? slicedLogs[slicedLogs.length - 1]?.created_at : null;

    return NextResponse.json({ logs: slicedLogs, nextCursor });
  } catch (err: any) {
    console.error('Admin audit logs GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

function actionLabelFallback(action: string) {
  switch (action) {
    case 'login': return 'เข้าสู่ระบบ';
    case 'publish_schedule': return 'ประกาศตารางเวร';
    case 'add_shift': return 'เพิ่มเวร';
    case 'edit_shift': return 'แก้ไขเวร';
    case 'delete_shift': return 'ลบเวร';
    case 'request_swap': return 'ขอแลกเวร';
    case 'request_cover': return 'ขออยู่แทน';
    case 'request_transfer': return 'โอนเวร';
    case 'export_report': return 'ดึงรายงาน';
    default: return action;
  }
}
