export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';
import { canManageRoleGroup, type UserRole } from '@/lib/types';
import { resolveSwapDirection } from '@/lib/shiftHistory';

// GET /api/admin/shifts/history?shiftId=...
// Read-only: every swap/transfer/cover request that ever touched this shift
// (either as the requested shift or as the counter-offer in a 'swap'),
// newest first. Backed by swap_requests, which is no longer purged by the
// cleanup cron (see app/api/cron/cleanup/route.ts) so this is permanent.
//
// Does NOT cover admin edits (shift_type/department/position changes) —
// nothing records those per-shift today; audit_logs has a human-readable
// line but its entity_id was dropped in 20260506_simplify_audit_logs.sql.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shiftId = req.nextUrl.searchParams.get('shiftId');
    if (!shiftId) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 });

    const supabase = createSupabaseServer();

    const { data: shift, error: shiftErr } = await supabase
      .from('shifts')
      .select('id, original_user_id, user:users!user_id(role), original_user:users!original_user_id(f_name, nickname)')
      .eq('id', shiftId)
      .single();
    if (shiftErr || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (session.role !== 'admin') {
      const owner: any = Array.isArray(shift.user) ? shift.user[0] : shift.user;
      if (!owner?.role || !canManageRoleGroup(session, owner.role as UserRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: requests, error: reqErr } = await supabase
      .from('swap_requests')
      .select(`
        id, request_type, status, shift_id, target_shift_id, created_at, updated_at,
        requester:users!requester_id(id, f_name, nickname),
        target_user:users!target_user_id(id, f_name, nickname)
      `)
      .or(`shift_id.eq.${shiftId},target_shift_id.eq.${shiftId}`)
      .order('created_at', { ascending: false });
    if (reqErr) throw reqErr;

    const originalUser: any = Array.isArray(shift.original_user) ? shift.original_user[0] : shift.original_user;

    return NextResponse.json({
      originalOwner: shift.original_user_id ? (originalUser?.nickname || originalUser?.f_name || null) : null,
      requests: (requests || []).map((r: any) => {
        const { isCounterOffer, fromUser, toUser } = resolveSwapDirection(r, shiftId);

        return {
          id: r.id,
          requestType: r.request_type,
          status: r.status,
          isCounterOffer,
          fromUser,
          toUser,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      }),
    });
  } catch (err: any) {
    console.error('Admin shifts history GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
