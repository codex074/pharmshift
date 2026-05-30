export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { hashPassword, shouldRehashPassword, verifyPassword } from '@/lib/password';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { password } = await request.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Missing password' }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', session.id)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    if (await shouldRehashPassword(user.password)) {
      await supabase
        .from('users')
        .update({ password: await hashPassword(password) })
        .eq('id', session.id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
