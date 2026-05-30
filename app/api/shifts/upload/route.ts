export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';
import { canManageRoleGroup, type UserRole } from '@/lib/types';
import { hashPassword, shouldRehashPassword, verifyPassword } from '@/lib/password';
import {
  AFTERNOON_MED_SLOT_FULL_MESSAGE,
  afternoonMedSlotKey,
  isAfternoonMedSlot,
} from '@/lib/shiftSlotRules';
import * as XLSX from 'xlsx';

type ShiftDateContext = {
  isWeekendOrHoliday: boolean;
  isWeekdayHoliday: boolean;
};

const projectShiftType = (dateContext: ShiftDateContext) =>
  dateContext.isWeekendOrHoliday ? 'เช้า' : 'บ่าย';

const mapShiftCode = (code: string, dateContext: ShiftDateContext, role: string) => {
  if (!code) return null;
  // Normalize Latin chars to lowercase; Thai chars are unchanged by toLowerCase()
  const c = code.trim().toLowerCase();

  // ── เภสัชกร ──
  if (role === 'pharmacist') {
    switch (c) {
      case 'e':   return { dept: 'ER',        type: 'เช้า',      position: '' };
      case 'd':   return { dept: 'MED',       type: 'เช้า',      position: 'D/C' };
      case 'c':   return { dept: 'MED',       type: 'เช้า',      position: 'Cont' };
      case 's':   return { dept: 'SURG',      type: 'เช้า',      position: '' };
      case 'ext': return { dept: 'โครงการ',  type: projectShiftType(dateContext), position: '' };
      case 'บm':  return { dept: 'MED',       type: 'บ่าย',      position: '' };
      case 'บe':  return { dept: 'ER',        type: 'บ่าย',      position: '' };
      case 'รo':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'OPD' };
      case 'รe':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'ER' };
      case 'รh':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'HIV' };
      case 'smc': return { dept: 'SMC',       type: 'บ่าย',      position: '' };
      case 'ch':  return { dept: 'Chemo',     type: 'เช้า',      position: '' };
      case 'ด':   return { dept: 'ER',        type: 'ดึก',       position: '' };
    }
  }

  // ── เจ้าพนักงานเภสัชกรรม ──
  if (role === 'pharmacy_technician') {
    switch (c) {
      case 'e':   return { dept: 'ER',        type: 'เช้า',      position: '' };
      case 'บe':  return { dept: 'ER',        type: 'บ่าย',      position: '' };
      case 'บm':  return { dept: 'MED',       type: 'บ่าย',      position: '' };
      case 'ext': return { dept: 'โครงการ',  type: projectShiftType(dateContext), position: '' };
      case 'รo':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'OPD' };
      case 'รe':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'ER' };
      case 'รh':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'HIV' };
      case 'ด':   return { dept: 'ER',        type: 'ดึก',       position: '' };
    }
    if (/^m[1-2]$/.test(c))   return { dept: 'MED',  type: 'เช้า',  position: c };
    if (/^s[1-2]$/.test(c))   return { dept: 'SURG', type: 'เช้า',  position: c };
    if (/^smc[1-2]$/.test(c)) return { dept: 'SMC',  type: 'บ่าย', position: c };
  }

  // ── เจ้าหน้าที่ ──
  if (role === 'officer') {
    switch (c) {
      case 'e':   return { dept: 'ER',        type: 'เช้า',      position: '' };
      case 'บm':  return { dept: 'MED',       type: 'บ่าย',      position: '' };
      case 'รe':  return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'ER' };
      case 'ด':   return { dept: 'ER',        type: 'ดึก',       position: '' };
    }
    if (/^m[1-4]$/.test(c))    return { dept: 'MED',       type: 'เช้า',  position: c };
    if (/^s[1-3]$/.test(c))    return { dept: 'SURG',      type: 'เช้า',  position: c };
    if (/^ext[1-2]$/.test(c))  return { dept: 'โครงการ',  type: projectShiftType(dateContext), position: c };
    if (/^บe[1-2]$/.test(c))   return { dept: 'ER',        type: 'บ่าย', position: c };
    if (/^smc[1-2]$/.test(c))  return { dept: 'SMC',       type: 'บ่าย', position: c };
    if (/^รo[1-2]$/.test(c))   return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: c };
    if (/^ส[1-4]$/.test(c))    return { dept: 'ส่งยา สอ.', type: 'เช้า', position: c };
  }

  return null;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const monthStr = formData.get('month') as string | null;
    const yearStr = formData.get('year') as string | null;
    const overwrite = formData.get('overwrite') === 'true';
    const adminPassword = formData.get('admin_password') as string | null;

    if (!file || !monthStr || !yearStr) {
      return NextResponse.json({ error: 'Missing file, month, or year.' }, { status: 400 });
    }

    const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 3MB)' }, { status: 413 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ .xlsx หรือ .xls เท่านั้น' }, { status: 400 });
    }

    const targetMonth = parseInt(monthStr);
    const targetYear = parseInt(yearStr);
    const monthPadded = String(targetMonth).padStart(2, '0');
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
    const monthYear = `${targetYear}-${monthPadded}`;

    const supabase = createSupabaseServer();

    // Read the Excel file first to know which role we are dealing with
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Excel file is empty or missing data.' }, { status: 400 });
    }

    const a1Content = String(rows[0][0] || '').trim();
    let sheetRole = 'pharmacist'; // Default fallback
    if (a1Content.includes('จพง') || a1Content === 'pharmacy_technician') {
      sheetRole = 'pharmacy_technician';
    } else if (a1Content.includes('จนท') || a1Content === 'officer') {
      sheetRole = 'officer';
    } else if (a1Content.includes('เภสัช') || a1Content === 'pharmacist') {
      sheetRole = 'pharmacist';
    }

    if (!canManageRoleGroup(session, sheetRole as UserRole)) {
      return NextResponse.json({ error: 'Forbidden. You can only upload shifts for your own role group.' }, { status: 403 });
    }

    // Find all users of this role to constraint the deletion/checking
    const { data: roleUsers, error: roleUsersErr } = await supabase
      .from('users')
      .select('id')
      .eq('role', sheetRole);

    if (roleUsersErr) {
      return NextResponse.json({ error: 'Failed to fetch role users' }, { status: 500 });
    }

    const roleUserIds = roleUsers?.map(u => u.id) || [];

    // Check if shifts already exist for this month AND this role
    let existingCount = 0;
    if (roleUserIds.length > 0) {
      const { count } = await supabase
        .from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('month_year', monthYear)
        .in('user_id', roleUserIds);
      existingCount = count || 0;
    }

    if (existingCount > 0 && !overwrite) {
      return NextResponse.json({
        error: 'MONTH_HAS_DATA',
        existingCount,
        message: `เดือนนี้มีเวรอยู่แล้ว ${existingCount} รายการ (เฉพาะตำแหน่งนี้) ต้องการวางทับข้อมูลเดิมหรือไม่?`,
      }, { status: 409 });
    }

    // If overwriting, verify admin password first (actual DELETE is deferred until after validation)
    if (overwrite) {
      if (!adminPassword) {
        return NextResponse.json({ error: 'ต้องใส่รหัสผ่าน Admin เพื่อยืนยันการวางทับ' }, { status: 400 });
      }
      const { data: adminUser, error: adminErr } = await supabase
        .from('users')
        .select('password')
        .eq('id', session.id)
        .single();

      if (adminErr || !adminUser || !(await verifyPassword(adminPassword, adminUser.password))) {
        return NextResponse.json({ error: 'รหัสผ่าน Admin ไม่ถูกต้อง' }, { status: 403 });
      }
      if (await shouldRehashPassword(adminUser.password)) {
        await supabase
          .from('users')
          .update({ password: await hashPassword(adminPassword) })
          .eq('id', session.id);
      }
      // Password verified — DELETE will run after we confirm the Excel has valid data
    }

    // Fetch all departments
    const { data: departments, error: deptError } = await supabase.from('departments').select('id, name');
    if (deptError) throw deptError;

    // Fetch all users
    const { data: users, error: usersError } = await supabase.from('users').select('id, nickname, pha_id');
    if (usersError) throw usersError;

    // Fetch holidays for this month to identify public holidays that fall on weekdays.
    const { data: holidays } = await supabase
      .from('holidays')
      .select('date')
      .gte('date', `${targetYear}-${monthPadded}-01`)
      .lte('date', `${targetYear}-${monthPadded}-${String(lastDayOfMonth).padStart(2, '0')}`);
    const holidaySet = new Set((holidays || []).map((h: { date: string }) => h.date));

    const deptMap = new Map<string, number>();
    const deptNameById = new Map<number, string>();
    departments.forEach((d) => deptMap.set(d.name.toLowerCase(), d.id));
    departments.forEach((d) => deptNameById.set(d.id, d.name));

    // Ensure Chemo exists
    if (!deptMap.has('chemo')) {
      const { data: newDept } = await supabase.from('departments').insert({ name: 'Chemo' }).select('id, name').single();
      if (newDept) {
        deptMap.set('chemo', newDept.id);
        deptNameById.set(newDept.id, newDept.name);
      }
    }

    // Ensure ส่งยา สอ. exists
    if (!deptMap.has('ส่งยา สอ.')) {
      const { data: newDept } = await supabase.from('departments').insert({ name: 'ส่งยา สอ.' }).select('id, name').single();
      if (newDept) {
        deptMap.set('ส่งยา สอ.', newDept.id);
        deptNameById.set(newDept.id, newDept.name);
      }
    }

    const userMap = new Map<string, string>();
    users.forEach((u) => {
      if (u.pha_id) userMap.set(u.pha_id.toLowerCase(), u.id);
      if (u.nickname) userMap.set(u.nickname.toLowerCase(), u.id);
    });

    const recordsToInsert = [];
    const errors = [];
    const dataRows = rows.slice(1);

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      if (!row || row.length === 0) continue;

      const userIdentifier = String(row[1] || '').trim();
      if (!userIdentifier) continue;

      const userId = userMap.get(userIdentifier.toLowerCase());
      if (!userId) {
        errors.push(`Row ${r + 2}: User not found for '${userIdentifier}'`);
        continue;
      }

      for (let day = 1; day <= lastDayOfMonth; day++) {
        const cellValue = String(row[day + 1] || '').trim();
        if (!cellValue) continue;

        const dateObj = new Date(targetYear, targetMonth - 1, day);
        const dateStr = `${targetYear}-${monthPadded}-${String(day).padStart(2, '0')}`;
        const dow = dateObj.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isPublicHoliday = holidaySet.has(dateStr);
        const dateContext = {
          isWeekendOrHoliday: isWeekend || isPublicHoliday,
          isWeekdayHoliday: isPublicHoliday && !isWeekend,
        };

        // Split by comma or "/" — multiple shifts in one cell (e.g. "E/ด", "C/ด", "ชM1,บM1")
        const shiftCodes = cellValue.split(/[,/]/).map(s => s.trim()).filter(Boolean);

        for (const code of shiftCodes) {
          const shiftData = mapShiftCode(code, dateContext, sheetRole);

          if (!shiftData) {
            errors.push(`Row ${r + 2}, Day ${day}: Unknown shift code '${code}'`);
            continue;
          }

          if (dateContext.isWeekdayHoliday && shiftData.dept === 'โครงการ') {
            shiftData.type = 'เช้า';
          }

          const deptId = deptMap.get(shiftData.dept.toLowerCase());
          if (!deptId) {
            errors.push(`Row ${r + 2}, Day ${day}: Department '${shiftData.dept}' not found in DB`);
            continue;
          }

          recordsToInsert.push({
            date: dateStr,
            department_id: deptId,
            shift_type: shiftData.type,
            position: shiftData.position,
            user_id: userId,
            original_user_id: userId,
            month_year: monthYear,
          });
        }
      }
    }

    if (recordsToInsert.length === 0) {
      return NextResponse.json(
        { error: 'No valid records found to insert. Check errors.', details: errors },
        { status: 400 }
      );
    }

    // Deduplicate records to prevent violating `unique_user_date_shifttype` constraint
    const uniqueRecordsMap = new Map<string, any>();
    const duplicateErrors: string[] = [];

    recordsToInsert.forEach((record) => {
      const key = `${record.user_id}_${record.date}_${record.shift_type}_${record.position}`;
      if (uniqueRecordsMap.has(key)) {
        duplicateErrors.push(`Duplicate shift ignored: User ${record.user_id}, Date ${record.date}, Type ${record.shift_type}`);
      } else {
        uniqueRecordsMap.set(key, record);
      }
    });

    const finalRecordsToInsert = Array.from(uniqueRecordsMap.values());

    const afternoonMedSlots = new Set<string>();
    const afternoonMedErrors: string[] = [];
    finalRecordsToInsert.forEach((record) => {
      const departmentName = deptNameById.get(record.department_id) || '';
      if (!isAfternoonMedSlot({ date: record.date, shift_type: record.shift_type, department: departmentName, position: record.position })) {
        return;
      }

      const key = afternoonMedSlotKey({ date: record.date, shift_type: record.shift_type, department: departmentName }, sheetRole);
      if (afternoonMedSlots.has(key)) {
        afternoonMedErrors.push(`${record.date}: เวรบ่าย MED มีมากกว่า 1 คนในไฟล์`);
        return;
      }
      afternoonMedSlots.add(key);
    });

    if (afternoonMedErrors.length > 0) {
      return NextResponse.json(
        { error: AFTERNOON_MED_SLOT_FULL_MESSAGE, details: afternoonMedErrors },
        { status: 400 }
      );
    }

    if (duplicateErrors.length > 0) {
      console.warn("Skipped duplicate shifts in Excel:", duplicateErrors);
      errors.push(...duplicateErrors);
    }

    // ── Deferred DELETE: only now that we know the Excel has valid data ──
    if (overwrite && roleUserIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('shifts')
        .delete()
        .eq('month_year', monthYear)
        .in('user_id', roleUserIds);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        return NextResponse.json({ error: 'ไม่สามารถลบข้อมูลเดิมได้', details: [deleteError.message] }, { status: 500 });
      }
    }

    // Plain insert (upsert cannot be used because unique_user_date_shifttype is DEFERRABLE)
    const BATCH_SIZE = 500;
    for (let i = 0; i < finalRecordsToInsert.length; i += BATCH_SIZE) {
      const batch = finalRecordsToInsert.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase.from('shifts').insert(batch);
      if (insertError) {
        console.error('Insert error:', insertError);
        const message = insertError.message?.includes('AFTERNOON_MED_SLOT_FULL')
          ? AFTERNOON_MED_SLOT_FULL_MESSAGE
          : 'Database insert failed';
        return NextResponse.json({ error: message, details: [insertError.message] }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully added ${recordsToInsert.length} shifts.`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Excel Upload Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
