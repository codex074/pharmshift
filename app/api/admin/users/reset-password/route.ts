import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Get the user's pha_id to use as default password
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('pha_id')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const defaultPassword = user.pha_id || 'password123';

    const { error } = await supabase
      .from('users')
      .update({
        password: defaultPassword,
        must_change_password: true,
      })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true, defaultPassword });
  } catch (error: any) {
    console.error('Admin reset password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
