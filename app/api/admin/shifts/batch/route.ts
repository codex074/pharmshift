export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { canManageRoleGroup, type UserRole } from '@/lib/types';
import { writeAuditLogs } from '@/lib/auditLog';
import {
  AFTERNOON_MED_SLOT_FULL_MESSAGE,
  DUPLICATE_SHIFT_MESSAGE,
  afternoonMedSlotKey,
  isAfternoonMedSlot,
  normalizeShiftPosition,
} from '@/lib/shiftSlotRules';

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

function displayUserName(user?: { f_name?: string | null } | null) {
  return user?.f_name || 'ไม่ทราบผู้ใช้';
}

function formatAuditDate(date?: string | null) {
  if (!date) return 'ไม่ทราบวันที่';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatShiftArea(input: {
  departmentName?: string | null;
  position?: string | null;
}) {
  const parts = [input.departmentName, input.position].filter(Boolean);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function normalizeBatchError(err: any): string {
  const raw = err?.message || '';

  if (raw.includes('AFTERNOON_MED_SLOT_FULL')) {
    return AFTERNOON_MED_SLOT_FULL_MESSAGE;
  }

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

function joinedUserRole(row: any) {
  const user = Array.isArray(row?.user) ? row.user[0] : row?.user;
  return user?.role || '';
}

function exactAddKey(input: {
  user_id?: string | null;
  date?: string | null;
  shift_type?: string | null;
  department_id?: number | null;
  position?: string | null;
}) {
  return [
    input.user_id || '',
    input.date || '',
    input.shift_type || '',
    input.department_id || '',
    normalizeShiftPosition(input.position),
  ].join('|');
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
    const departmentIds = Array.from(new Set(adds.map((add: any) => add.department_id).filter(Boolean)));

    const [{ data: shiftRows }, { data: userRows }, { data: departmentRows }] = await Promise.all([
      shiftIds.length
        ? supa
            .from('shifts')
            .select(`
              id, date, shift_type, position,
              department:departments(name),
              user:users!user_id(f_name)
            `)
            .in('id', shiftIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supa
            .from('users')
            .select('id, f_name, role')
            .in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      departmentIds.length
        ? supa
            .from('departments')
            .select('id, name')
            .in('id', departmentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const shiftMap = new Map((shiftRows || []).map((row: any) => [row.id, row]));
    const userMap = new Map((userRows || []).map((row: any) => [row.id, row]));
    const departmentMap = new Map((departmentRows || []).map((row: any) => [row.id, row.name]));

    if (adds.some((add: any) => !userMap.has(add.user_id) || !departmentMap.has(add.department_id))) {
      return NextResponse.json({ error: 'Invalid add shift payload' }, { status: 400 });
    }

    if (adds.length > 0) {
      const deleteIdSet = new Set(deleteIds);
      const seenExactAdds = new Set<string>();
      const seenAfternoonMedAdds = new Set<string>();

      for (const add of adds) {
        const exactKey = exactAddKey(add);
        if (seenExactAdds.has(exactKey)) {
          return NextResponse.json({ error: DUPLICATE_SHIFT_MESSAGE }, { status: 409 });
        }
        seenExactAdds.add(exactKey);

        const departmentName = departmentMap.get(add.department_id) || '';
        if (isAfternoonMedSlot({ date: add.date, shift_type: add.shift_type, department: departmentName, position: add.position })) {
          const role = userMap.get(add.user_id)?.role || '';
          const medKey = afternoonMedSlotKey({ date: add.date, shift_type: add.shift_type, department: departmentName }, role);
          if (seenAfternoonMedAdds.has(medKey)) {
            return NextResponse.json({ error: AFTERNOON_MED_SLOT_FULL_MESSAGE }, { status: 409 });
          }
          seenAfternoonMedAdds.add(medKey);
        }
      }

      const addDates = Array.from(new Set(adds.map((add: any) => add.date)));
      const addUsers = Array.from(new Set(adds.map((add: any) => add.user_id)));
      const addShiftTypes = Array.from(new Set(adds.map((add: any) => add.shift_type)));

      const { data: existingPotential, error: existingPotentialErr } = await supa
        .from('shifts')
        .select('id, date, shift_type, position, user_id, department_id')
        .in('date', addDates)
        .in('user_id', addUsers)
        .in('shift_type', addShiftTypes);

      if (existingPotentialErr) throw existingPotentialErr;

      const existingExactKeys = new Set(
        (existingPotential || [])
          .filter((row: any) => !deleteIdSet.has(row.id))
          .map((row: any) => exactAddKey(row)),
      );

      if (adds.some((add: any) => existingExactKeys.has(exactAddKey(add)))) {
        return NextResponse.json({ error: DUPLICATE_SHIFT_MESSAGE }, { status: 409 });
      }

      const afternoonMedAdds = adds
        .map((add: any) => ({
          add,
          departmentName: departmentMap.get(add.department_id) || '',
          role: userMap.get(add.user_id)?.role || '',
        }))
        .filter(({ add, departmentName }: any) =>
          isAfternoonMedSlot({ date: add.date, shift_type: add.shift_type, department: departmentName, position: add.position })
        );

      if (afternoonMedAdds.length > 0) {
        const medDates = Array.from(new Set(afternoonMedAdds.map(({ add }: any) => add.date)));
        const medDepartmentIds = Array.from(new Set(afternoonMedAdds.map(({ add }: any) => add.department_id)));

        const { data: existingMedRows, error: existingMedErr } = await supa
          .from('shifts')
          .select('id, date, shift_type, department_id, user:users!user_id(role)')
          .eq('shift_type', 'บ่าย')
          .in('date', medDates)
          .in('department_id', medDepartmentIds);

        if (existingMedErr) throw existingMedErr;

        const existingMedKeys = new Set(
          (existingMedRows || [])
            .filter((row: any) => !deleteIdSet.has(row.id))
            .map((row: any) =>
              afternoonMedSlotKey(
                { date: row.date, shift_type: row.shift_type, department: 'MED' },
                joinedUserRole(row),
              )
            ),
        );

        if (afternoonMedAdds.some(({ add, role }: any) =>
          existingMedKeys.has(afternoonMedSlotKey({ date: add.date, shift_type: add.shift_type, department: 'MED' }, role))
        )) {
          return NextResponse.json({ error: AFTERNOON_MED_SLOT_FULL_MESSAGE }, { status: 409 });
        }
      }
    }

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

    const auditEntries = [
      ...deleteIds.map((shiftId: string) => {
        const shift = shiftMap.get(shiftId);
        return {
          actorUserId: session.id,
          action: 'delete_shift',
          description: `ลบเวร${shift?.shift_type || ''}${formatShiftArea({
            departmentName: shift?.department?.name,
            position: shift?.position,
          })} วันที่ ${formatAuditDate(shift?.date)} ของ ${displayUserName(shift?.user)}`,
        };
      }),
      ...ownerEdits.map((edit: { shift_id: string; user_id: string }) => {
        const shift = shiftMap.get(edit.shift_id);
        const nextUser = userMap.get(edit.user_id);
        return {
          actorUserId: session.id,
          action: 'edit_shift',
          description: `แก้ไขเวร${shift?.shift_type || ''}${formatShiftArea({
            departmentName: shift?.department?.name,
            position: shift?.position,
          })} วันที่ ${formatAuditDate(shift?.date)} จาก ${displayUserName(shift?.user)} เป็น ${displayUserName(nextUser)}`,
        };
      }),
      ...adds.map((add: {
        date: string;
        department_id: number;
        shift_type: string;
        position: string | null;
        user_id: string;
      }) => ({
        actorUserId: session.id,
        action: 'add_shift',
        description: `เพิ่มเวร${add.shift_type || ''}${formatShiftArea({
          departmentName: departmentMap.get(add.department_id) || '',
          position: add.position,
        })} วันที่ ${formatAuditDate(add.date)} ให้ ${displayUserName(userMap.get(add.user_id))}`,
      })),
    ];

    await writeAuditLogs(auditEntries);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin shifts batch POST error:', err);
    return NextResponse.json({ error: normalizeBatchError(err) }, { status: 500 });
  }
}
