export const dynamic = 'force-dynamic';
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
      .select('id, pha_id, prefix, f_name, l_name, nickname, role, is_sub_admin, is_active, profile_image, salary_number, must_change_password, created_at')
      .order('f_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ users: data });
  } catch (error: any) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pha_id, prefix, f_name, l_name, nickname, salary_number, role, is_sub_admin } = body;

    if (!f_name || !l_name || !role) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อ นามสกุล และตำแหน่ง' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Check pha_id uniqueness if provided
    if (pha_id) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('pha_id', pha_id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: `รหัส ${pha_id} มีผู้ใช้งานแล้ว` }, { status: 409 });
      }
    }

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        pha_id: pha_id || null,
        prefix: prefix || null,
        f_name,
        l_name,
        nickname: nickname || null,
        salary_number: salary_number || null,
        role,
        is_sub_admin: role === 'admin' ? false : (is_sub_admin ?? false),
        is_active: true,
        password: '1234',
        must_change_password: true,
      })
      .select('id, pha_id, f_name, l_name')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    console.error('Admin users POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === session.id) {
      return NextResponse.json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Check if user has any shifts (past or future)
    const { count: shiftCount } = await supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (shiftCount && shiftCount > 0) {
      return NextResponse.json(
        {
          error: `ไม่สามารถลบได้ — ผู้ใช้นี้มีข้อมูลเวรอยู่ ${shiftCount} รายการ\nกรุณาลบหรือโอนย้ายเวรทั้งหมดก่อน หรือใช้การ "ระงับบัญชี" แทน`,
          shiftCount,
        },
        { status: 409 }
      );
    }

    // Cleanup related data before deleting user
    await supabase.from('swap_requests').delete().eq('requester_id', userId);
    await supabase.from('swap_requests').delete().eq('target_user_id', userId);
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);

    // Delete the user
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, prefix, f_name, l_name, nickname, salary_number, role, is_sub_admin, is_active } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    const updatePayload: Record<string, any> = {};
    if (prefix !== undefined) updatePayload.prefix = prefix || null;
    if (f_name !== undefined) updatePayload.f_name = f_name;
    if (l_name !== undefined) updatePayload.l_name = l_name;
    if (nickname !== undefined) updatePayload.nickname = nickname || null;
    if (salary_number !== undefined) updatePayload.salary_number = salary_number || null;
    if (role !== undefined) updatePayload.role = role;
    if (is_sub_admin !== undefined) {
      // Admin role cannot be sub-admin; auto-clear if setting role to admin
      const effectiveRole = role ?? null;
      updatePayload.is_sub_admin = effectiveRole === 'admin' ? false : is_sub_admin;
    }
    if (is_active !== undefined) updatePayload.is_active = is_active;

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
