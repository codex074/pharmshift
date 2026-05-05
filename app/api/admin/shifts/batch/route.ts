export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { canManageRoleGroup, type UserRole } from '@/lib/types';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type OwnerEditPayload = {
  shiftId?: string;
  userId?: string;
};

type AddShiftPayload = {
  date?: string;
  departmentId?: number;
  shiftType?: string;
  position?: string | null;
  userId?: string;
  originalUserId?: string | null;
  monthYear?: string;
};

function normalizeBatchError(err: any): string {
  const raw = err?.message || '';

  if (err?.code === '42883' || raw.includes('apply_admin_shift_changes_atomic')) {
    return 'ยังไม่ได้ติดตั้งฟังก์ชันฐานข้อมูลสำหรับบันทึก audit log กรุณารัน SQL migration ล่าสุดก่อน';
  }

  if (err?.code === '23505' || raw.includes('unique_user_date_shifttype')) {
    return 'ไม่สามารถบันทึกได้ เพราะมีคนเดียวกันอยู่เวรซ้อนในวันและผลัดเดียวกัน';
  }

  if (raw.includes('SHIFT_NOT_FOUND')) {
    return 'ไม่พบเวรบางรายการ กรุณารีเฟรชแล้วลองอีกครั้ง';
  }

  return raw || 'ไม่สามารถบันทึกการเปลี่ยนแปลงเวรได้';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const deleteIds = Array.isArray(body.deleteIds) ? body.deleteIds.filter(Boolean) : [];
    const ownerEdits = Array.isArray(body.ownerEdits)
      ? body.ownerEdits.map((edit: OwnerEditPayload) => ({
          shift_id: edit.shiftId,
          user_id: edit.userId,
        }))
      : [];
    const adds = Array.isArray(body.adds)
      ? body.adds.map((add: AddShiftPayload) => ({
          date: add.date,
          department_id: add.departmentId,
          shift_type: add.shiftType,
          position: add.position || null,
          user_id: add.userId,
          original_user_id: add.originalUserId || null,
          month_year: add.monthYear,
        }))
      : [];

    if (ownerEdits.some((edit: any) => !edit.shift_id || !edit.user_id)) {
      return NextResponse.json({ error: 'Invalid owner edit payload' }, { status: 400 });
    }
    if (adds.some((add: any) => !add.date || !add.department_id || !add.shift_type || !add.user_id || !add.month_year)) {
      return NextResponse.json({ error: 'Invalid add shift payload' }, { status: 400 });
    }

    const shiftIds = Array.from(new Set([...deleteIds, ...ownerEdits.map((edit: any) => edit.shift_id)]));
    const userIds = Array.from(new Set([
      ...ownerEdits.map((edit: any) => edit.user_id),
      ...adds.map((add: any) => add.user_id),
    ]));

    if (session.role !== 'admin') {
      if (shiftIds.length) {
        const { data: shifts, error: shiftsErr } = await supa
          .from('shifts')
          .select('id, user:users!user_id(role)')
          .in('id', shiftIds);
        if (shiftsErr) throw shiftsErr;

        const editableShiftIds = new Set(
          (shifts || [])
            .filter((row: any) => {
              const owner = Array.isArray(row.user) ? row.user[0] : row.user;
              return owner?.role && canManageRoleGroup(session, owner.role as UserRole);
            })
            .map((row: any) => row.id),
        );

        if (shiftIds.some((id) => !editableShiftIds.has(id))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      if (userIds.length) {
        const { data: users, error: usersErr } = await supa
          .from('users')
          .select('id, role')
          .in('id', userIds);
        if (usersErr) throw usersErr;

        const assignableUserIds = new Set(
          (users || [])
            .filter((user: any) => canManageRoleGroup(session, user.role as UserRole))
            .map((user: any) => user.id),
        );

        if (userIds.some((id) => !assignableUserIds.has(id))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    const { error } = await supa.rpc('apply_admin_shift_changes_atomic', {
      p_delete_ids: deleteIds,
      p_owner_edits: ownerEdits,
      p_adds: adds,
      p_actor_user_id: session.id,
    });

    if (error) {
      return NextResponse.json({ error: normalizeBatchError(error) }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin shifts batch POST error:', err);
    return NextResponse.json({ error: normalizeBatchError(err) }, { status: 500 });
  }
}
