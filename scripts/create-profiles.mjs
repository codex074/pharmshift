/**
 * create-profiles.mjs
 * 
 * Creates user profiles in the `users` table for all existing Supabase Auth users.
 * Run this AFTER running supabase/schema.sql in the Supabase SQL Editor.
 * 
 * Usage:
 *   node scripts/create-profiles.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env.local
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Read user.json for name/prefix data
const usersJson = JSON.parse(readFileSync(join(__dirname, '..', 'user.json'), 'utf-8'));
const userMap = new Map();
for (const u of usersJson) {
  userMap.set(`${u.pha_id}@ntogether.app`, u);
}

// List all auth users
const { data: { users: authUsers }, error } = await supabase.auth.admin.listUsers({ perPage: 100 });
if (error) { console.error('❌', error.message); process.exit(1); }

console.log(`📋 Found ${authUsers.length} auth users\n`);

let created = 0, skipped = 0, errors = 0;

for (const au of authUsers) {
  const userData = userMap.get(au.email);
  if (!userData) {
    console.log(`  ⏩ ${au.email} — not in user.json, skipping`);
    skipped++;
    continue;
  }

  const { pha_id, name: fullName } = userData;
  const prefix = fullName.startsWith('ภก.') ? 'ภก.' : fullName.startsWith('ภญ.') ? 'ภญ.' : '';
  const nameWithoutPrefix = prefix ? fullName.slice(3) : fullName;
  const profileImage = prefix === 'ภก.' ? 'male' : 'female';

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', au.id)
    .maybeSingle();

  if (existing) {
    console.log(`  ⏩ ${pha_id} (${fullName}) — profile exists`);
    skipped++;
    continue;
  }

  const { error: insertError } = await supabase.from('users').insert({
    auth_id: au.id,
    name: nameWithoutPrefix,
    nickname: null,
    prefix,
    role: 'pharmacist',
    profile_image: profileImage,
    must_change_password: true,
  });

  if (insertError) {
    console.log(`  ❌ ${pha_id}: ${insertError.message}`);
    errors++;
  } else {
    console.log(`  ✅ ${pha_id} (${fullName})`);
    created++;
  }
}

console.log(`\n🎉 Done! Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
