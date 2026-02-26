/**
 * create-users.mjs
 * 
 * Reads user.json and creates Supabase Auth users + profiles.
 * Login via pha_id (e.g. pha208), password: 1234
 * Email is left blank — users add it on first login.
 * Internally uses {pha_id}@ntogether.app as Supabase auth email.
 * 
 * Usage:
 *   node scripts/create-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env.local manually
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) {
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Service role client (admin access)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Read user.json
const users = JSON.parse(readFileSync(join(__dirname, '..', 'user.json'), 'utf-8'));
console.log(`📋 Found ${users.length} pharmacists in user.json\n`);

let created = 0;
let skipped = 0;
let errors = 0;

for (const u of users) {
  const {"pha_id": pha_id} = u;
  const fullName = u.name;
  
  // Parse prefix and name
  const prefix = fullName.startsWith('ภก.') ? 'ภก.' : fullName.startsWith('ภญ.') ? 'ภญ.' : '';
  const nameWithoutPrefix = prefix ? fullName.slice(3) : fullName;
  const profileImage = prefix === 'ภก.' ? 'male' : 'female';

  process.stdout.write(`  ${pha_id} (${fullName})... `);

  try {
    // Insert directly into the users table without GoTrue Auth
    const { error: profileError } = await supabase.from('users').insert({
      pha_id: pha_id,
      password: '1234',
      name: nameWithoutPrefix,
      fullname: fullName,      // used later for printing/reimbursement docs
      nickname: null,          // will be linked to schedule nickname later
      prefix,
      role: 'pharmacist',
      profile_image: profileImage,
      must_change_password: true,
    });

    if (profileError) {
      if (profileError.code === '23505' || profileError.message.includes('unique constraint')) {
        console.log('⏩ already exists');
        skipped++;
      } else {
        console.log(`❌ profile: ${profileError.message}`);
        errors++;
      }
    } else {
      console.log('✅ created');
      created++;
    }
  } catch (err) {
    console.log(`❌ ${err.message}`);
    errors++;
  }
}

console.log(`\n🎉 Done!`);
console.log(`   Created: ${created}`);
console.log(`   Skipped: ${skipped}`);
console.log(`   Errors:  ${errors}`);
console.log(`\n🔑 Login with:`);
console.log(`   User ID:  pha_id (e.g. pha208)`);
console.log(`   Password: 1234`);
console.log(`   → Will be prompted to change password on first login.`);
