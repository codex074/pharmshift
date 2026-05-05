export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { createSession } from '@/lib/session';
import { isMobileUserAgent } from '@/lib/deviceDetection';
import { writeAuditLog } from '@/lib/auditLog';

export async function POST(request: Request) {
  try {
    const { phaId, password } = await request.json();
    const normalizedPhaId = typeof phaId === 'string' ? phaId.trim().toLowerCase() : '';

    if (!phaId || !password) {
      return NextResponse.json({ error: 'Please provide pha_id and password' }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Find the user by pha_id
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('pha_id', normalizedPhaId)
      .single();

    if (error || !user) {
      await writeAuditLog({
        action: 'login_failed',
        entityType: 'auth',
        metadata: { pha_id: normalizedPhaId, reason: 'user_not_found' },
        request,
      });
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }

    // Checking the password directly with text equality
    if (user.password !== password) {
      await writeAuditLog({
        actorUserId: user.id,
        action: 'login_failed',
        entityType: 'auth',
        entityId: user.id,
        metadata: { pha_id: normalizedPhaId, reason: 'wrong_password' },
        request,
      });
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }

    // Block disabled accounts
    if (user.is_active === false) {
      await writeAuditLog({
        actorUserId: user.id,
        action: 'login_blocked',
        entityType: 'auth',
        entityId: user.id,
        metadata: { pha_id: normalizedPhaId, reason: 'inactive_account' },
        request,
      });
      return NextResponse.json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' }, { status: 403 });
    }

    // Set the custom auth token cookie
    await createSession(user, {
      persistent: isMobileUserAgent(request.headers.get('user-agent')),
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: 'login_success',
      entityType: 'auth',
      entityId: user.id,
      metadata: { pha_id: normalizedPhaId, role: user.role },
      request,
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
