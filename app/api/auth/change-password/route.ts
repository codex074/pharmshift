import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/session';
import { createSupabaseServer } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    
    // Update the password directly
    const { data: user, error } = await supabase
      .from('users')
      .update({
        password: password,
        must_change_password: false,
      })
      .eq('id', session.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Refresh the session with new data
    await createSession(user);

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
