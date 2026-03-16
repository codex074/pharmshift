import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from('users')
      .select('id, pha_id, name, fullname, nickname, prefix, role, is_sub_admin, profile_image, salary_number, must_change_password, created_at')
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ users: data });
  } catch (error: any) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, fullname, nickname, salary_number, role, is_sub_admin } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    const updatePayload: Record<string, any> = {};
    if (fullname !== undefined) updatePayload.fullname = fullname || null;
    if (nickname !== undefined) updatePayload.nickname = nickname || null;
    if (salary_number !== undefined) updatePayload.salary_number = salary_number || null;
    if (role !== undefined) updatePayload.role = role;
    if (is_sub_admin !== undefined) {
      // Admin role cannot be sub-admin; auto-clear if setting role to admin
      const effectiveRole = role ?? null;
      updatePayload.is_sub_admin = effectiveRole === 'admin' ? false : is_sub_admin;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin users PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
