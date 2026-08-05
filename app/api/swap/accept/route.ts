export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { sendPushToUser } from '@/lib/pushSender';
import { checkSwapCollision, fmtShift } from '@/lib/swapCollision';
import { notifyAutoRejected } from '@/lib/swapAutoReject';

// Service-role client — bypasses RLS, used for trusted server-side mutations
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/* ── POST handler ────────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  // 1) Auth
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { swapId, force } = await request.json();
  if (!swapId) {
    return NextResponse.json({ error: 'Missing swapId' }, { status: 400 });
  }

  // 2) Fetch full request with joined data
  const { data: req, error: fetchErr } = await supa
    .from('swap_requests')
    .select(`
      *,
      shift:shifts!shift_id(*, department:departments(id, name), user:users!user_id(id, f_name, nickname, role)),
      target_shift:shifts!target_shift_id(*, department:departments(id, name), user:users!user_id(id, f_name, nickname, role)),
      requester:users!requester_id(id, f_name, nickname),
      target_user:users!target_user_id(id, f_name, nickname)
    `)
    .eq('id', swapId)
    .single();

  if (fetchErr || !req) {
    return NextResponse.json({ error: 'ไม่พบคำขอ' }, { status: 404 });
  }

  // Verify caller is the target (only target can accept)
  if (req.target_user_id !== session.id) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ยอมรับคำขอนี้' }, { status: 403 });
  }

  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' }, { status: 409 });
  }

  // Verify shift ownership hasn't changed
  const { data: freshShift } = await supa
    .from('shifts').select('user_id').eq('id', req.shift_id).single();
  if (freshShift && req.shift && freshShift.user_id !== req.shift.user_id) {
    return NextResponse.json({ error: 'เวรนี้ถูกเปลี่ยนเจ้าของไปแล้ว กรุณารีเฟรช' }, { status: 409 });
  }

  // 3) Pre-acceptance collision check
  //    Overlap + sequence → soft warn, recipient กดยืนยัน (force=true) ได้
  const collisionMsg = await checkSwapCollision(supa, req);
  if (collisionMsg && !force) {
    return NextResponse.json({ collision: collisionMsg });
  }

  // 4) Accept atomically in the database to prevent double-accept races
  const { data: acceptRows, error: acceptErr } = await supa.rpc('accept_swap_request_atomic', {
    p_swap_id: req.id,
    p_actor_user_id: session.id,
  });
  if (acceptErr) {
    console.error('[swap/accept] atomic accept error:', acceptErr);
    const raw = acceptErr.message || '';
    if (acceptErr.code === '23505' || raw.includes('unique_user_date_shifttype')) {
      return NextResponse.json({
        error: 'ฐานข้อมูลยังใช้กฎเดิมที่ห้ามรับเวรซ้อนอยู่ กรุณารัน migration ล่าสุดก่อน',
      }, { status: 409 });
    }
    return NextResponse.json({ error: 'ไม่สามารถดำเนินการรับคำขอได้' }, { status: 500 });
  }

  const acceptResult = Array.isArray(acceptRows) ? acceptRows[0] : acceptRows;
  if (!acceptResult?.ok) {
    const errorCode = acceptResult?.error_code;
    if (errorCode === 'FORBIDDEN') {
      return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ยอมรับคำขอนี้' }, { status: 403 });
    }
    if (errorCode === 'ALREADY_PROCESSED') {
      return NextResponse.json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' }, { status: 409 });
    }
    if (errorCode === 'SHIFT_OWNERSHIP_CHANGED') {
      return NextResponse.json({ error: 'เวรนี้ถูกเปลี่ยนเจ้าของไปแล้ว กรุณารีเฟรช' }, { status: 409 });
    }
    if (errorCode === 'NOT_FOUND' || errorCode === 'SHIFT_NOT_FOUND' || errorCode === 'TARGET_SHIFT_NOT_FOUND') {
      return NextResponse.json({ error: 'ไม่พบคำขอนี้' }, { status: 404 });
    }
    return NextResponse.json({ error: 'ไม่สามารถดำเนินการรับคำขอได้' }, { status: 500 });
  }

  // 5) Notifications
  const acceptorName = req.target_user?.nickname || req.target_user?.f_name || 'เพื่อนร่วมงาน';
  const acceptTitle = req.request_type === 'swap'
    ? '✅ แลกเวรสำเร็จ'
    : req.request_type === 'cover'
    ? '✅ อยู่เวรแทนสำเร็จ'
    : '✅ โอนเวรสำเร็จ';
  const acceptBody = req.request_type === 'swap'
    ? `${acceptorName} ยอมรับการแลกเวรแล้ว — คุณได้รับ ${fmtShift(req.shift)}`
    : req.request_type === 'cover'
    ? `${acceptorName} ได้ยอมรับให้อยู่เวรแทนแล้ว — ${fmtShift(req.shift)}`
    : `${acceptorName} รับ ${fmtShift(req.shift)} แล้ว`;

  sendPushToUser(req.requester_id, {
    title: acceptTitle,
    body: acceptBody,
    url: '/calendar',
    tag: `swap-${req.id}`,
  }).catch(() => {});

  // In-app notification
  await supa.from('notifications').insert({
    user_id: req.requester_id, type: 'swap_result',
    title: acceptTitle, body: acceptBody, url: '/calendar',
  });

  // 6) Notify requests auto-rejected by the atomic accept
  const autoRejectedIds = (acceptResult.auto_rejected_ids || []) as string[];
  await notifyAutoRejected(supa, autoRejectedIds, [req.requester_id, req.target_user_id], req.shift);

  return NextResponse.json({ ok: true });
}
