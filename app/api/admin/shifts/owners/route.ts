export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { canManageRoleGroup, type UserRole } from '@/lib/types';
import { AFTERNOON_MED_SLOT_FULL_MESSAGE } from '@/lib/shiftSlotRules';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type OwnerEditPayload = {
  shiftId?: string;
  userId?: string;
};

function normalizeOwnerEditError(err: any): string {
  const raw = err?.message || '';

  if (raw.includes('AFTERNOON_MED_SLOT_FULL')) {
    return AFTERNOON_MED_SLOT_FULL_MESSAGE;
  }

  if (err?.code === '42883' || raw.includes('apply_shift_owner_edits_atomic')) {
    return 'ยังไม่ได้ติดตั้งฟังก์ชันฐานข้อมูลสำหรับบันทึกการสลับเวร กรุณารัน SQL migration ล่าสุดก่อน';
  }

  if (err?.code === '23505' || raw.includes('unique_user_date_shifttype')) {
    return 'ไม่สามารถบันทึกได้ เพราะมีคนเดียวกันอยู่เวรซ้อนในวันและผลัดเดียวกัน';
  }

  if (raw.includes('SHIFT_NOT_FOUND')) {
    return 'ไม่พบเวรบางรายการ กรุณารีเฟรชแล้วลองอีกครั้ง';
  }

  return raw || 'ไม่สามารถบันทึกการเปลี่ยนคนอยู่เวรได้';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { edits } = await req.json();
    if (!Array.isArray(edits) || edits.length === 0) {
      return NextResponse.json({ error: 'edits is required' }, { status: 400 });
    }

    const normalized = edits.map((edit: OwnerEditPayload) => ({
      shift_id: edit.shiftId,
      user_id: edit.userId,
    }));

    if (normalized.some((edit) => !edit.shift_id || !edit.user_id)) {
      return NextResponse.json({ error: 'Invalid edit payload' }, { status: 400 });
    }

    const shiftIds = Array.from(new Set(normalized.map((edit) => edit.shift_id)));
    const userIds = Array.from(new Set(normalized.map((edit) => edit.user_id)));

    if (session.role !== 'admin') {
      const [{ data: shifts, error: shiftsErr }, { data: users, error: usersErr }] = await Promise.all([
        supa
          .from('shifts')
          .select('id, user:users!user_id(role)')
          .in('id', shiftIds),
        supa
          .from('users')
          .select('id, role')
          .in('id', userIds),
      ]);

      if (shiftsErr) throw shiftsErr;
      if (usersErr) throw usersErr;

      const editableShiftIds = new Set(
        (shifts || [])
          .filter((row: any) => {
            const owner = Array.isArray(row.user) ? row.user[0] : row.user;
            return owner?.role && canManageRoleGroup(session, owner.role as UserRole);
          })
          .map((row: any) => row.id),
      );

      const assignableUserIds = new Set(
        (users || [])
          .filter((user: any) => canManageRoleGroup(session, user.role as UserRole))
          .map((user: any) => user.id),
      );

      if (shiftIds.some((id) => !editableShiftIds.has(id)) || userIds.some((id) => !assignableUserIds.has(id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { error } = await supa.rpc('apply_shift_owner_edits_atomic', {
      p_edits: normalized,
      p_actor_user_id: session.id,
    });

    if (error) {
      return NextResponse.json({ error: normalizeOwnerEditError(error) }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin shift owners POST error:', err);
    return NextResponse.json({ error: normalizeOwnerEditError(err) }, { status: 500 });
  }
}
