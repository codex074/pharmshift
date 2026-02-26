import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createSupabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const session = await getSession();

  if (!session?.id) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const supabase = createSupabaseServer();
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.id)
    .single();

  if (error || !user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
