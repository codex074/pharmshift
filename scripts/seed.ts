/**
 * seed.ts — Seed the Supabase database from scripts/schedule.json
 *
 * Usage:
 *   npx ts-node scripts/seed.ts
 *   OR after compiling:
 *   node scripts/seed.js
 *
 * Prerequisites:
 *   1. Run: python3 scripts/parse-schedule.py   (generates schedule.json)
 *   2. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 *   3. Run the SQL schema in supabase/schema.sql
 *   4. Create Supabase Auth users first, then run this script
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
  console.error('❌ Please set real Supabase credentials in .env.local before seeding.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface ParsedUser {
  nickname: string;
  name: string;
  prefix: string;
  profile_image: string;
}

interface ParsedShift {
  date: string;
  nickname: string;
  shift_type: string;
  department: string;
  month_year: string;
}

async function main() {
  // Load parsed data
  const dataPath = path.join(__dirname, 'schedule.json');
  if (!fs.existsSync(dataPath)) {
    console.error('❌ schedule.json not found. Run: python3 scripts/parse-schedule.py first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const { users: parsedUsers, shifts: parsedShifts } = data as {
    users: ParsedUser[];
    shifts: ParsedShift[];
  };

  console.log(`📋 Loaded ${parsedUsers.length} users and ${parsedShifts.length} shifts from schedule.json`);

  // 1. Fetch existing users (with nicknames)
  const { data: existingUsers, error: usersError } = await supabase
    .from('users')
    .select('id, nickname, name');

  if (usersError) {
    console.error('❌ Failed to fetch users:', usersError.message);
    process.exit(1);
  }

  const userByNick = new Map<string, string>(); // nickname → id
  for (const u of (existingUsers || [])) {
    if (u.nickname) userByNick.set(u.nickname, u.id);
  }

  // 2. Upsert users who don't exist yet (skip those with no auth_id)
  let createdCount = 0;
  for (const u of parsedUsers) {
    if (!userByNick.has(u.nickname)) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          name: u.name,
          nickname: u.nickname,
          prefix: u.prefix,
          profile_image: u.profile_image,
          role: 'pharmacist',
        })
        .select('id')
        .single();

      if (!error && newUser) {
        userByNick.set(u.nickname, newUser.id);
        createdCount++;
      } else if (error) {
        console.warn(`  ⚠️ Could not insert user ${u.nickname}:`, error.message);
      }
    }
  }
  console.log(`✅ Users: ${createdCount} created, ${existingUsers?.length || 0} already existed`);

  // 3. Fetch departments
  const { data: depts } = await supabase.from('departments').select('id, name');
  const deptByName = new Map<string, number>();
  for (const d of (depts || [])) deptByName.set(d.name, d.id);

  // 4. Insert shifts in batches
  const shiftRows = [];
  let skipped = 0;

  for (const s of parsedShifts) {
    const userId = userByNick.get(s.nickname);
    const deptId = deptByName.get(s.department);

    if (!userId) { skipped++; continue; }

    shiftRows.push({
      date: s.date,
      department_id: deptId || null,
      shift_type: s.shift_type,
      user_id: userId,
      month_year: s.month_year,
    });
  }

  console.log(`📅 Inserting ${shiftRows.length} shifts (${skipped} skipped — user not found)...`);

  // Clear existing shifts for this month first
  if (shiftRows.length > 0) {
    const { month_year } = parsedShifts[0];
    await supabase.from('shifts').delete().eq('month_year', month_year);

    // Insert in batches of 50
    const BATCH = 50;
    for (let i = 0; i < shiftRows.length; i += BATCH) {
      const batch = shiftRows.slice(i, i + BATCH);
      const { error } = await supabase.from('shifts').insert(batch);
      if (error) console.warn(`  ⚠️ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      else process.stdout.write('.');
    }
    console.log('\n✅ Shifts inserted successfully');
  }

  console.log('\n🎉 Seeding complete!');
  console.log(`   Users: ${userByNick.size} total`);
  console.log(`   Shifts: ${shiftRows.length} rows inserted`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
