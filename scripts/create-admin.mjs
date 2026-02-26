/**
 * create-admin.mjs
 * 
 * Creates an admin user in Supabase Auth + profiles.
 * 
 * Usage:
 *   node scripts/create-admin.mjs
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

const ADMIN_PHA_ID = 'admin';
const ADMIN_EMAIL  = 'admin@ntogether.app';
const ADMIN_PW     = 'admin1234';

console.log('Creating admin user...\n');

// 1. Create auth user
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PW,
  email_confirm: true,
  user_metadata: { pha_id: ADMIN_PHA_ID, role: 'admin' },
});

if (authError) {
  if (authError.message.includes('already') || authError.message.includes('exists')) {
    console.log('⏩ Auth user already exists');

    // Still ensure profile exists
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 200 });
    const adminAuth = users.find(u => u.email === ADMIN_EMAIL);
    if (adminAuth) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', adminAuth.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from('users').insert({
          auth_id: adminAuth.id,
          pha_id: ADMIN_PHA_ID,
          name: 'ผู้ดูแลระบบ',
          nickname: 'Admin',
          prefix: '',
          role: 'admin',
          profile_image: 'male',
          password: ADMIN_PW,
          must_change_password: false,
        });
        console.log('✅ Profile created');
      } else {
        console.log('⏩ Profile already exists');
      }
    }
  } else {
    console.error('❌', authError.message);
    process.exit(1);
  }
} else {
  // 2. Create profile
  const { error: profileError } = await supabase.from('users').insert({
    auth_id: authData.user.id,
    pha_id: ADMIN_PHA_ID,
    name: 'ผู้ดูแลระบบ',
    nickname: 'Admin',
    prefix: '',
    role: 'admin',
    profile_image: 'male',
    password: ADMIN_PW,
    must_change_password: false,
  });

  if (profileError) {
    console.log(`✅ Auth created, ⚠️ profile: ${profileError.message}`);
  } else {
    console.log('✅ Admin user created!');
  }
}

console.log('\n🔑 Admin login:');
console.log('   User ID:  admin');
console.log('   Password: admin1234');
console.log('   Role: admin (full access)');
