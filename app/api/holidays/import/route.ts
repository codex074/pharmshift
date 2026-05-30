export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { isAdminLike } from '@/lib/types';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!isAdminLike(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Parse holidays map from request body: { "2026-01-01": "วันขึ้นปีใหม่", ... }
    let holidaysMap: Record<string, unknown>;
    try {
      holidaysMap = await req.json();
    } catch {
      return NextResponse.json({ error: 'ข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
    }
    if (!holidaysMap || typeof holidaysMap !== 'object' || Array.isArray(holidaysMap)) {
      return NextResponse.json({ error: 'ข้อมูลต้องเป็น JSON object ของ { "YYYY-MM-DD": "ชื่อวันหยุด" }' }, { status: 400 });
    }

    // 2. Transform to array
    const holidayEntries = Object.entries(holidaysMap)
      .filter(([, name]) => typeof name === 'string' && name.trim())
      .map(([date, name]) => ({
        date,
        name: (name as string).trim(),
      }));

    if (holidayEntries.length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อมูลวันหยุดในไฟล์' }, { status: 400 });
    }

    // 3. Upsert to Supabase
    // We use ON CONFLICT (date) DO UPDATE to prevent duplicate date errors
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('holidays')
      .upsert(holidayEntries, { onConflict: 'date' })
      .select();

    if (error) {
      console.error('Supabase Upsert Error:', error);
      throw new Error('เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูล');
    }

    return NextResponse.json({ 
      success: true, 
      count: data?.length || 0,
      message: `นำเข้าข้อมูลวันหยุดสำเร็จจำนวน ${data?.length || 0} วัน`
    });

  } catch (error: any) {
    console.error('Error importing holidays:', error);
    return NextResponse.json({ error: error.message || 'Failed to import holidays' }, { status: 500 });
  }
}
