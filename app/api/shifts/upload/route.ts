import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getSession } from '@/lib/session';
import * as XLSX from 'xlsx';

const mapShiftCode = (code: string, isWeekend: boolean, role: string) => {
  if (!code) return null;
  const c = code.trim();

  // Generic shifts
  switch (c) {
    case 'smc': return { dept: 'SMC', type: 'บ่าย', position: '' };
    case 'Ext': return { dept: 'โครงการ', type: isWeekend ? 'เช้า' : 'บ่าย', position: '' };
    case 'S':
    case 's':  return { dept: 'SURG', type: 'เช้า', position: '' };
    case 'รO': return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'OPD' };
    case 'รE': return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'ER' };
    case 'รH': return { dept: 'รุ่งอรุณ', type: 'รุ่งอรุณ', position: 'HIV' };
    case 'บE': return { dept: 'ER', type: 'บ่าย', position: '' };
    case 'ชE': return { dept: 'ER', type: 'เช้า', position: '' };
    case 'ด':  return { dept: 'ER', type: 'ดึก', position: '' };
    case 'chem': return { dept: 'Chemo', type: 'เช้า', position: '' };
  }

  // Pharmacist specific
  if (role === 'pharmacist') {
    switch (c) {
      case 'บM': return { dept: 'MED', type: 'บ่าย', position: '' };
      case 'c':  return { dept: 'MED', type: 'เช้า', position: 'Cont' };
      case 'd':  return { dept: 'MED', type: 'เช้า', position: 'D/C' };
    }
  }

  // Pharmacy Technician specific
  if (role === 'pharmacy_technician') {
    if (c === 'ชM' || c === 'ชM1' || c === 'ชM2' || c === 'ชM3') {
      return { dept: 'MED', type: 'เช้า', position: c === 'ชM' ? '' : c };
    }
    if (c === 'บM' || c === 'บM1' || c === 'บM2') {
      return { dept: 'MED', type: 'บ่าย', position: c === 'บM' ? '' : c };
    }
  }

  return null;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
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

    const targetMonth = parseInt(monthStr);
    const targetYear = parseInt(yearStr);
    const monthYear = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

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

    // If overwriting, verify admin password
    if (overwrite) {
      if (!adminPassword) {
        return NextResponse.json({ error: 'ต้องใส่รหัสผ่าน Admin เพื่อยืนยันการวางทับ' }, { status: 400 });
      }
      const { data: adminUser, error: adminErr } = await supabase
        .from('users')
        .select('password')
        .eq('id', session.id)
        .single();

      if (adminErr || !adminUser || adminUser.password !== adminPassword) {
        return NextResponse.json({ error: 'รหัสผ่าน Admin ไม่ถูกต้อง' }, { status: 403 });
      }

      // Delete ONLY existing shifts for this month and for users of this role
      if (roleUserIds.length > 0) {
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
    }

    // Fetch all departments
    const { data: departments, error: deptError } = await supabase.from('departments').select('id, name');
    if (deptError) throw deptError;

    // Fetch all users
    const { data: users, error: usersError } = await supabase.from('users').select('id, nickname, pha_id');
    if (usersError) throw usersError;

    const deptMap = new Map<string, number>();
    departments.forEach((d) => deptMap.set(d.name.toLowerCase(), d.id));

    // Ensure Chemo exists
    if (!deptMap.has('chemo')) {
      const { data: newDept } = await supabase.from('departments').insert({ name: 'Chemo' }).select('id, name').single();
      if (newDept) {
        deptMap.set('chemo', newDept.id);
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

      for (let day = 1; day <= 31; day++) {
        const cellValue = String(row[day + 1] || '').trim();
        if (!cellValue) continue;

        const dateObj = new Date(targetYear, targetMonth - 1, day);
        if (dateObj.getMonth() !== targetMonth - 1) continue; // Skip invalid days (like Feb 30)

        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Split by comma in case there are multiple shifts in one cell (e.g., "ชM1,บM1")
        const shiftCodes = cellValue.split(',').map(s => s.trim()).filter(Boolean);

        for (const code of shiftCodes) {
          const shiftData = mapShiftCode(code, isWeekend, sheetRole);

          if (!shiftData) {
            errors.push(`Row ${r + 2}, Day ${day}: Unknown shift code '${code}'`);
            continue;
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

    if (duplicateErrors.length > 0) {
      console.warn("Skipped duplicate shifts in Excel:", duplicateErrors);
      errors.push(...duplicateErrors);
    }

    // Batch upsert into shifts table (ignore conflicts from DB)
    const { error: insertError } = await supabase.from('shifts').upsert(
      finalRecordsToInsert,
      { onConflict: 'user_id,date,shift_type,position', ignoreDuplicates: true }
    );

    if (insertError) {
      console.error('Insert/Upsert error:', insertError);
      return NextResponse.json({ error: 'Database insert failed', details: [insertError.message] }, { status: 500 });
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

