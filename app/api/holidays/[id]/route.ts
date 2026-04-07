export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// UPDATE a holiday by ID
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { date, name } = body;

    if (!date || !name) {
      return NextResponse.json({ error: 'Missing date or name' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('holidays')
      .update({ date, name })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'วันนี้ถูกตั้งเป็นวันหยุดแล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json({ error: 'Failed to update holiday' }, { status: 500 });
  }
}

// DELETE a holiday by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const { error } = await supabase
      .from('holidays')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500 });
  }
}
