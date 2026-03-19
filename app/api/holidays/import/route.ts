export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    // 1. Read the JSON file
    const filePath = path.join(process.cwd(), 'holidays.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'ไม่พบไฟล์ holidays.json ในเซิร์ฟเวอร์' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const holidaysMap = JSON.parse(fileContent);

    // 2. Transform to array
    const holidayEntries = Object.entries(holidaysMap).map(([date, name]) => ({
      date,
      name: name as string,
    }));

    if (holidayEntries.length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อมูลวันหยุดในไฟล์' }, { status: 400 });
    }

    // 3. Upsert to Supabase
    // We use ON CONFLICT (date) DO UPDATE to prevent duplicate date errors
    const supabase = createSupabaseServer();
    const { data, error } = await supabase
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
