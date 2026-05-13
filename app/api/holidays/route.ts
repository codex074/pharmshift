export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { isAdminLike } from '@/lib/types';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET all holidays
export async function GET() {
  try {
    const { data: holidays, error } = await supabase
      .from('holidays')
      .select('*')
      .order('date', { ascending: true });

    if (error) throw error;
    return NextResponse.json(holidays);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return NextResponse.json({ error: 'Failed to fetch holidays' }, { status: 500 });
  }
}

// CREATE a new holiday
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!isAdminLike(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { date, name } = body;

    if (!date || !name) {
      return NextResponse.json({ error: 'Missing date or name' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('holidays')
      .insert([{ date, name }])
      .select()
      .single();

    if (error) {
       if (error.code === '23505') { // Unique constraint violation (likely date)
           return NextResponse.json({ error: 'วันนี้ถูกตั้งเป็นวันหยุดแล้ว' }, { status: 400 });
       }
       throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json({ error: 'Failed to create holiday' }, { status: 500 });
  }
}
