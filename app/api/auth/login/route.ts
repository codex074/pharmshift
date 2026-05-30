export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { createSession } from '@/lib/session';
import { isMobileUserAgent } from '@/lib/deviceDetection';
import { writeAuditLog } from '@/lib/auditLog';
import { hashPassword, shouldRehashPassword, verifyPassword } from '@/lib/password';

const LOGIN_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_USER = 5;
const MAX_ATTEMPTS_PER_IP = 30;

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

function createLoginAttemptClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getRecentLoginAttempts(supabase: ReturnType<typeof createLoginAttemptClient>, phaId: string, ip: string) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000).toISOString();

  try {
    const [{ count: byUser, error: userError }, { count: byIp, error: ipError }] = await Promise.all([
      supabase
        .from('login_attempts')
        .select('id', { head: true, count: 'exact' })
        .eq('pha_id', phaId)
        .gt('attempted_at', since),
      supabase
        .from('login_attempts')
        .select('id', { head: true, count: 'exact' })
        .eq('ip', ip)
        .gt('attempted_at', since),
    ]);

    if (userError || ipError) {
      console.warn('[auth/login] login_attempts unavailable:', userError || ipError);
      return null;
    }

    return { byUser: byUser ?? 0, byIp: byIp ?? 0 };
  } catch (error) {
    console.warn('[auth/login] login_attempts check failed:', error);
    return null;
  }
}

async function recordFailedLogin(supabase: ReturnType<typeof createLoginAttemptClient>, phaId: string, ip: string) {
  try {
    const { error } = await supabase
      .from('login_attempts')
      .insert({ pha_id: phaId || 'unknown', ip });

    if (error) console.warn('[auth/login] login_attempts insert failed:', error);
  } catch (error) {
    console.warn('[auth/login] login_attempts insert failed:', error);
  }
}

export async function POST(request: Request) {
  try {
    const { phaId, password } = await request.json();
    const normalizedPhaId = typeof phaId === 'string' ? phaId.trim().toLowerCase() : '';
    const ip = getClientIp(request);

    if (!phaId || !password) {
      return NextResponse.json({ error: 'Please provide pha_id and password' }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    const loginAttemptClient = createLoginAttemptClient();
    const attempts = await getRecentLoginAttempts(loginAttemptClient, normalizedPhaId, ip);
    if (attempts && (attempts.byUser >= MAX_ATTEMPTS_PER_USER || attempts.byIp >= MAX_ATTEMPTS_PER_IP)) {
      return NextResponse.json({ error: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่แล้วลองใหม่' }, { status: 429 });
    }

    // Find the user by pha_id
    const { data: user, error } = await supabase
      .from('users')
      .select('id, pha_id, prefix, f_name, l_name, role, is_sub_admin, must_change_password, password, is_active')
      .eq('pha_id', normalizedPhaId)
      .single();

    if (error || !user) {
      await recordFailedLogin(loginAttemptClient, normalizedPhaId, ip);
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }

    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
      await recordFailedLogin(loginAttemptClient, normalizedPhaId, ip);
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }

    // Block disabled accounts
    if (user.is_active === false) {
      return NextResponse.json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' }, { status: 403 });
    }

    if (await shouldRehashPassword(user.password)) {
      await loginAttemptClient
        .from('users')
        .update({ password: await hashPassword(password) })
        .eq('id', user.id);
    }

    // Set the custom auth token cookie
    await createSession(user, {
      persistent: isMobileUserAgent(request.headers.get('user-agent')),
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: 'login',
      description: `เข้าสู่ระบบ`,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        prefix: user.prefix,
        f_name: user.f_name,
        l_name: user.l_name,
        pha_id: user.pha_id,
        must_change_password: user.must_change_password,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
