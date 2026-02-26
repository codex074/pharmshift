import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const { fullname, nickname, password } = body;

    if (!fullname || !nickname) {
      return NextResponse.json({ error: 'Missing required fields (fullname, nickname)' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    const updatePayload: any = {
      fullname,
      nickname,
    };

    if (password && password.trim() !== '') {
      updatePayload.password = password.trim();
    }

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', session.id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Profile updated successfully' });
  } catch (error: any) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
