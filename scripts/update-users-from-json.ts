/**
 * update-users-from-json.ts — Update user prefix, f_name, l_name, nickname, salary_number from user.json
 *
 * Usage:
 *   npx tsx scripts/update-users-from-json.ts
 *
 * Prerequisites:
 *   1. Run the migration SQL: supabase/run_migrate_user_names.sql
 *   2. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Set Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface UserJson {
  pha_id: string;
  prefix: string;
  f_name: string;
  l_name: string;
  nickname: string;
  role: string;
  salary_number: string;
}

// Map role from user.json to DB role
function mapRole(role: string): string {
  const mapping: Record<string, string> = {
    phamacist: 'pharmacist',
    pharmacist: 'pharmacist',
    pharmacy_technician: 'pharmacy_technician',
    officer: 'officer',
    admin: 'admin',
  };
  return mapping[role] || 'pharmacist';
}

async function main() {
  const jsonPath = path.join(__dirname, '..', 'user.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ user.json not found');
    process.exit(1);
  }

  const users: UserJson[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📋 Loaded ${users.length} users from user.json`);

  let updated = 0;
  let created = 0;
  let errors = 0;

  for (const u of users) {
    const pha_id = u.pha_id.trim().toLowerCase();
    const updateData = {
      prefix: u.prefix.trim(),
      f_name: u.f_name.trim(),
      l_name: u.l_name.trim(),
      nickname: u.nickname.trim(),
      role: mapRole(u.role),
      salary_number: u.salary_number?.trim() || null,
    };

    // Try to update existing user by pha_id
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('pha_id', pha_id)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('pha_id', pha_id);

      if (error) {
        console.warn(`  ⚠️ Failed to update ${pha_id}: ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      // Insert new user
      const { error } = await supabase
        .from('users')
        .insert({ pha_id, ...updateData });

      if (error) {
        console.warn(`  ⚠️ Failed to insert ${pha_id}: ${error.message}`);
        errors++;
      } else {
        created++;
      }
    }
  }

  console.log(`\n🎉 Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Created: ${created}`);
  console.log(`   Errors:  ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
