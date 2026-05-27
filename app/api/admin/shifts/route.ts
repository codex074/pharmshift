export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';
import { canManageRoleGroup, type UserRole } from '@/lib/types';
import { AFTERNOON_MED_SLOT_FULL_MESSAGE, isAfternoonMedSlot } from '@/lib/shiftSlotRules';

// GET  /api/admin/shifts?month=2026-03&role=pharmacist&dept_id=5&page=0
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const month    = searchParams.get('month');
    const requestedRole = searchParams.get('role') as UserRole | null;
    const role = session.role === 'admin'
      ? requestedRole
      : (session.role as UserRole);
    const deptId   = searchParams.get('dept_id');
    const page     = parseInt(searchParams.get('page') || '0');
    const pageSize = 25;

    if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });
    if (role && !canManageRoleGroup(session, role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createSupabaseServer();

    // Resolve role → user IDs
    let userIds: string[] | null = null;
    if (role) {
      const { data: ru, error: ruErr } = await supabase
        .from('users').select('id').eq('role', role);
      if (ruErr) throw ruErr;
      userIds = (ru || []).map((u: { id: string }) => u.id);
      if (userIds.length === 0) {
        return NextResponse.json({ shifts: [], total: 0 });
      }
    }

    // Fetch holidays for this month (for suspicious flag)
    const [y, m] = month.split('-');
    const { data: holidays } = await supabase
      .from('holidays')
      .select('date')
      .gte('date', `${y}-${m}-01`)
      .lte('date', `${y}-${m}-31`);
    const holidayDates = (holidays || []).map((h: { date: string }) => h.date);

    // Build shifts query
    let query = supabase
      .from('shifts')
      .select(
        'id, date, shift_type, position, month_year, user_id, department_id, users!shifts_user_id_fkey(id, nickname, pha_id), departments(id, name)',
        { count: 'exact' }
      )
      .eq('month_year', month)
      .order('date', { ascending: true })
      .order('user_id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (userIds) query = query.in('user_id', userIds);
    if (deptId)  query = query.eq('department_id', parseInt(deptId));

    const { data, count, error } = await query;
    if (error) throw error;

    // Rename joins to match frontend expectations
    const shifts = (data || []).map((row: any) => ({
      id:         row.id,
      date:       row.date,
      shift_type: row.shift_type,
      position:   row.position,
      month_year: row.month_year,
      user:       row.users,
      department: row.departments,
    }));

    return NextResponse.json({ shifts, total: count ?? 0, holidayDates });
  } catch (err: any) {
    console.error('Admin shifts GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

// PUT  /api/admin/shifts  { id, shift_type, department_id, position }
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, shift_type, department_id, position } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const supabase = createSupabaseServer();
    const { data: shiftRow, error: shiftRowErr } = await supabase
      .from('shifts')
      .select('date, user:users!user_id(role)')
      .eq('id', id)
      .single();
    if (shiftRowErr || !shiftRow) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const shiftUser: any = (shiftRow as any)?.user;
    const targetRole = (Array.isArray(shiftUser) ? shiftUser[0]?.role : shiftUser?.role) as UserRole | undefined;

    if (session.role !== 'admin') {
      if (!targetRole || !canManageRoleGroup(session, targetRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (department_id) {
      const { data: departmentRow, error: departmentErr } = await supabase
        .from('departments')
        .select('name')
        .eq('id', department_id)
        .single();
      if (departmentErr || !departmentRow) {
        return NextResponse.json({ error: 'Department not found' }, { status: 400 });
      }

      if (isAfternoonMedSlot({ shift_type, department: departmentRow.name, position })) {
        const { data: occupiedRows, error: occupiedErr } = await supabase
          .from('shifts')
          .select('id, user:users!user_id(role)')
          .eq('date', shiftRow.date)
          .eq('shift_type', 'บ่าย')
          .eq('department_id', department_id)
          .neq('id', id);

        if (occupiedErr) throw occupiedErr;

        const hasSameRoleMedShift = (occupiedRows || []).some((row: any) => {
          const user = Array.isArray(row.user) ? row.user[0] : row.user;
          return user?.role && user.role === targetRole;
        });

        if (hasSameRoleMedShift) {
          return NextResponse.json({ error: AFTERNOON_MED_SLOT_FULL_MESSAGE }, { status: 409 });
        }
      }
    }

    const { error } = await supabase
      .from('shifts')
      .update({ shift_type, department_id, position: position || null })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin shifts PUT error:', err);
    const message = err.message?.includes('AFTERNOON_MED_SLOT_FULL')
      ? AFTERNOON_MED_SLOT_FULL_MESSAGE
      : err.message || 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE  /api/admin/shifts  { id }
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const supabase = createSupabaseServer();
    if (session.role !== 'admin') {
      const { data: shiftRow } = await supabase
        .from('shifts')
        .select('user:users!user_id(role)')
        .eq('id', id)
        .single();
      const shiftUser: any = shiftRow?.user;
      const targetRole = (Array.isArray(shiftUser) ? shiftUser[0]?.role : shiftUser?.role) as UserRole | undefined;
      if (!targetRole || !canManageRoleGroup(session, targetRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    const { error } = await supabase.from('shifts').delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin shifts DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

// PATCH  /api/admin/shifts/fix-suspicious  { month, dept_name }
// bulk fix: โครงการ+บ่าย+holiday → เช้า
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { month, dept_name } = await req.json();
    if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });
    if (session.role !== 'admin' && !canManageRoleGroup(session, session.role as UserRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createSupabaseServer();

    // Find dept ID
    const { data: deptRow } = await supabase
      .from('departments').select('id').eq('name', dept_name || 'โครงการ').single();
    if (!deptRow) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

    // Get holidays for this month
    const [y, m] = month.split('-');
    const { data: holidays } = await supabase
      .from('holidays').select('date')
      .gte('date', `${y}-${m}-01`)
      .lte('date', `${y}-${m}-31`);
    const holidayDates = (holidays || []).map((h: { date: string }) => h.date);

    if (holidayDates.length === 0) {
      return NextResponse.json({ updated: 0, message: 'ไม่พบวันหยุดในเดือนนี้' });
    }

    let patchQuery = supabase
      .from('shifts')
      .update({ shift_type: 'เช้า' })
      .eq('department_id', deptRow.id)
      .eq('shift_type', 'บ่าย')
      .eq('month_year', month)
      .in('date', holidayDates)
      .select('id, user:users!user_id(role)');

    if (session.role !== 'admin') {
      const { data: usersOfRole } = await supabase
        .from('users')
        .select('id')
        .eq('role', session.role);
      const roleUserIds = (usersOfRole || []).map((u: { id: string }) => u.id);
      patchQuery = patchQuery.in('user_id', roleUserIds);
    }

    const { error, data: updated } = await patchQuery;

    if (error) throw error;
    return NextResponse.json({ success: true, updated: (updated || []).length });
  } catch (err: any) {
    console.error('Admin shifts PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
