export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';

// GET  /api/admin/shifts?month=2026-03&role=pharmacist&dept_id=5&page=0
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const month    = searchParams.get('month');
    const role     = searchParams.get('role');
    const deptId   = searchParams.get('dept_id');
    const page     = parseInt(searchParams.get('page') || '0');
    const pageSize = 25;

    if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });

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
        'id, date, shift_type, position, month_year, user_id, department_id, users(id, nickname, pha_id), departments(id, name)',
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
    const { error } = await supabase
      .from('shifts')
      .update({ shift_type, department_id, position: position || null })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin shifts PUT error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
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

    const { error, data: updated } = await supabase
      .from('shifts')
      .update({ shift_type: 'เช้า' })
      .eq('department_id', deptRow.id)
      .eq('shift_type', 'บ่าย')
      .eq('month_year', month)
      .in('date', holidayDates)
      .select('id');

    if (error) throw error;
    return NextResponse.json({ success: true, updated: (updated || []).length });
  } catch (err: any) {
    console.error('Admin shifts PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
