export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/session';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { isMobileUserAgent } from '@/lib/deviceDetection';
import { hashPassword, verifyPassword } from '@/lib/password';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { oldPassword, password } = await request.json();

    if (!oldPassword || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    const { data: existingUser, error: readError } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', session.id)
      .single();

    if (readError || !existingUser) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    if (!(await verifyPassword(oldPassword, existingUser.password))) {
      return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 401 });
    }
    
    const { data: user, error } = await supabase
      .from('users')
      .update({
        password: await hashPassword(password),
        must_change_password: false,
      })
      .eq('id', session.id)
      .select('id, pha_id, prefix, f_name, l_name, role, is_sub_admin, must_change_password')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Refresh the session with new data
    await createSession(user, {
      persistent: isMobileUserAgent(request.headers.get('user-agent')),
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
