/**
 * update-nicknames.mjs
 * 
 * Reads user.json and updates the nickname for each user in Supabase
 * based on their pha_id.
 * 
 * Usage:
 *   node scripts/update-nicknames.mjs
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
console.log(`📋 Found ${users.length} pharmacists in user.json to update nicknames for\n`);

let updated = 0;
let errors = 0;

for (const u of users) {
  if (!u.nickname) continue;

  process.stdout.write(`Updating ${u.pha_id} (${u.name}) -> nickname: ${u.nickname}... `);

  try {
    const { error } = await supabase
      .from('users')
      .update({ nickname: u.nickname })
      .eq('pha_id', u.pha_id);

    if (error) {
      console.log(`❌ error: ${error.message}`);
      errors++;
    } else {
      console.log('✅ updated');
      updated++;
    }
  } catch (err) {
    console.log(`❌ ${err.message}`);
    errors++;
  }
}

console.log(`\n🎉 Done!`);
console.log(`   Updated: ${updated}`);
console.log(`   Errors:  ${errors}`);
