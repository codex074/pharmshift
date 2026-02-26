/**
 * fix-pha-id.mjs
 * 
 * Removes duplicate user profiles and ensures all profiles have pha_id set.
 * 
 * Usage:
 *   node scripts/fix-pha-id.mjs
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

// Get all profiles
const { data: allProfiles } = await supabase.from('users').select('*');
console.log(`Total profiles in DB: ${allProfiles.length}`);

// Group by auth_id to find duplicates
const byAuthId = new Map();
for (const p of allProfiles) {
  if (!byAuthId.has(p.auth_id)) byAuthId.set(p.auth_id, []);
  byAuthId.get(p.auth_id).push(p);
}

// Delete duplicates — keep the one WITH pha_id, or the first one
let deleted = 0;
for (const [authId, profiles] of byAuthId) {
  if (profiles.length <= 1) continue;
  
  // Keep the one with pha_id set, or the first
  const keeper = profiles.find(p => p.pha_id) || profiles[0];
  const toDelete = profiles.filter(p => p.id !== keeper.id);
  
  for (const dup of toDelete) {
    const { error } = await supabase.from('users').delete().eq('id', dup.id);
    if (!error) {
      console.log(`  🗑️  Deleted duplicate for auth_id ${authId}`);
      deleted++;
    }
  }
}
console.log(`Deleted ${deleted} duplicate profiles\n`);

// Now update pha_id for any that are still missing
const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 100 });

let updated = 0;
for (const au of authUsers) {
  const phaId = phaMap.get(au.email);
  if (!phaId) continue;

  // Check current profile
  const { data: profile } = await supabase
    .from('users')
    .select('id, pha_id')
    .eq('auth_id', au.id)
    .maybeSingle();

  if (!profile) continue;
  if (profile.pha_id === phaId) continue; // already set

  const { error } = await supabase
    .from('users')
    .update({ pha_id: phaId })
    .eq('id', profile.id);

  if (error) {
    console.log(`  ❌ ${phaId}: ${error.message}`);
  } else {
    console.log(`  ✅ ${phaId}`);
    updated++;
  }
}

// Final count
const { data: final } = await supabase.from('users').select('id, pha_id');
const withPha = final.filter(p => p.pha_id).length;
console.log(`\n🎉 Done! Updated: ${updated}`);
console.log(`   Total profiles: ${final.length}, with pha_id: ${withPha}`);
