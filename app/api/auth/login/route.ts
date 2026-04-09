export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { createSession } from '@/lib/session';
import { isMobileUserAgent } from '@/lib/deviceDetection';

export async function POST(request: Request) {
  try {
    const { phaId, password } = await request.json();

    if (!phaId || !password) {
      return NextResponse.json({ error: 'Please provide pha_id and password' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Find the user by pha_id
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('pha_id', phaId.trim().toLowerCase())
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }

    // Checking the password directly with text equality
    if (user.password !== password) {
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }

    // Block disabled accounts
    if (user.is_active === false) {
      return NextResponse.json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' }, { status: 403 });
    }

    // Set the custom auth token cookie
    await createSession(user, {
      persistent: isMobileUserAgent(request.headers.get('user-agent')),
    });

    return NextResponse.json({
      user: {
        id: user.id,
        prefix: user.prefix,
        f_name: user.f_name,
        l_name: user.l_name,
        pha_id: user.pha_id,
        must_change_password: user.must_change_password,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
