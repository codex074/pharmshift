import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const users = JSON.parse(readFileSync(join(__dirname, '..', 'user.json'), 'utf-8'));
console.log(`📋 Found ${users.length} users in user.json to upsert\n`);

let success = 0;
let errors = 0;

async function run() {
  for (const u of users) {
    process.stdout.write(`Upserting ${u.pha_id} (${u.name})... `);

    // Some entries in user.json might have spelled 'phamacist'
    const role = u.role === 'phamacist' ? 'pharmacist' : u.role;

    const payload = {
      pha_id: u.pha_id,
      name: u.name,
      nickname: u.nickname || null,
      role: role,
      salary_number: u.salary_number || null,
      password: '1234',
      must_change_password: true
    };

    try {
      const { error } = await supabase
        .from('users')
        .upsert(payload, { onConflict: 'pha_id' });

      if (error) {
        console.log(`❌ error: ${error.message}`);
        errors++;
      } else {
        console.log('✅ updated');
        success++;
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      errors++;
    }
  }

  console.log(`\n🎉 Done!`);
  console.log(`   Success: ${success}`);
  console.log(`   Errors:  ${errors}`);
}

run();
