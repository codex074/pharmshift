export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { writeAuditLog } from '@/lib/auditLog';
import {
  compensationRatesToRows,
  isCompensationCategoryKey,
  isStaffCompensationRole,
  normalizeCompensationRates,
  type CompensationRateRow,
} from '@/lib/compensation';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchRates() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('compensation_rates')
    .select('category, role, rate')
    .order('category', { ascending: true })
    .order('role', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return compensationRatesToRows(normalizeCompensationRates());
    }
    throw error;
  }

  return compensationRatesToRows(normalizeCompensationRates(data as CompensationRateRow[]));
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rates = await fetchRates();
    return NextResponse.json({ rates });
  } catch (error: any) {
    console.error('Compensation rates GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const rows = Array.isArray(body?.rates) ? body.rates : null;
    if (!rows) {
      return NextResponse.json({ error: 'rates is required' }, { status: 400 });
    }

    const payload = rows.map((row: any) => {
      const category = String(row?.category || '');
      const role = String(row?.role || '');
      if (row?.rate === '' || row?.rate === null || row?.rate === undefined) {
        throw new Error('อัตราค่าตอบแทนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      }
      const rate = Number(row?.rate);

      if (!isCompensationCategoryKey(category) || !isStaffCompensationRole(role)) {
        throw new Error('พบประเภทเวรหรือ role ที่ไม่ถูกต้อง');
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error('อัตราค่าตอบแทนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      }

      return {
        category,
        role,
        rate: Math.round(rate * 100) / 100,
      };
    });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('compensation_rates')
      .upsert(payload, { onConflict: 'category,role' });

    if (error) throw error;

    await writeAuditLog({
      actorUserId: session.id,
      action: 'update_compensation_rates',
      description: 'แก้ไขอัตราค่าตอบแทนเวร',
    });

    const rates = await fetchRates();
    return NextResponse.json({ success: true, rates });
  } catch (error: any) {
    console.error('Compensation rates PUT error:', error);
    const message = error.code === '42P01'
      ? 'ยังไม่ได้สร้างตาราง compensation_rates กรุณารัน migration ก่อนบันทึก'
      : error.message || 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
