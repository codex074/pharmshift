/**
 * add-pha-id.mjs
 * 
 * Updates all user profiles with their pha_id from user.json.
 * Run AFTER executing this SQL in Supabase SQL Editor:
 *   ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pha_id text UNIQUE;
 * 
 * Usage:
 *   node scripts/add-pha-id.mjs
 */

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
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Load user.json
const usersJson = JSON.parse(readFileSync(join(__dirname, '..', 'user.json'), 'utf-8'));
const phaMap = new Map();
for (const u of usersJson) {
  phaMap.set(`${u.pha_id}@ntogether.app`, u.pha_id);
}

// Get all auth users
const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 100 });
console.log(`📋 Found ${authUsers.length} auth users\n`);

let updated = 0;
let errors = 0;

for (const au of authUsers) {
  const phaId = phaMap.get(au.email);
  if (!phaId) continue;

  const { error } = await supabase
    .from('users')
    .update({ pha_id: phaId })
    .eq('auth_id', au.id);

  if (error) {
    console.log(`  ❌ ${phaId}: ${error.message}`);
    errors++;
  } else {
    console.log(`  ✅ ${phaId}`);
    updated++;
  }
}

console.log(`\n🎉 Done! Updated: ${updated}, Errors: ${errors}`);
