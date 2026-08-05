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

const SELECT_WITH_JOINS = `
  *,
  shift:shifts!shift_id(*, department:departments(id, name), user:users!user_id(id, f_name, nickname, role)),
  target_shift:shifts!target_shift_id(*, department:departments(id, name), user:users!user_id(id, f_name, nickname, role)),
  requester:users!requester_id(id, f_name, nickname),
  target_user:users!target_user_id(id, f_name, nickname)
`;

/**
 * Called right after a client creates a swap_requests row. Checks whether a
 * pending request already exists that mirrors it exactly (e.g. cover vs.
 * transfer of the same shift between the same two people in reverse, or two
 * reciprocal swap requests) and, if so, auto-confirms both instead of making
 * either side click accept. Any scheduling collision falls back to the
 * normal manual-accept flow — this route never forces through a warning.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { newRequestId } = await request.json();
  if (!newRequestId) {
    return NextResponse.json({ error: 'Missing newRequestId' }, { status: 400 });
  }

  const { data: newReq, error: fetchErr } = await supa
    .from('swap_requests')
    .select(SELECT_WITH_JOINS)
    .eq('id', newRequestId)
    .single();

  if (fetchErr || !newReq) {
    return NextResponse.json({ matched: false });
  }

  if (newReq.requester_id !== session.id) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ดำเนินการนี้' }, { status: 403 });
  }

  if (newReq.status !== 'pending') {
    return NextResponse.json({ matched: false });
  }

  // Find the pending counterpart that mirrors this request exactly.
  let mirrorQuery = supa
    .from('swap_requests')
    .select(SELECT_WITH_JOINS)
    .eq('status', 'pending')
    .eq('requester_id', newReq.target_user_id)
    .eq('target_user_id', newReq.requester_id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (newReq.request_type === 'transfer') {
    mirrorQuery = mirrorQuery.eq('request_type', 'cover').eq('shift_id', newReq.shift_id);
  } else if (newReq.request_type === 'cover') {
    mirrorQuery = mirrorQuery.eq('request_type', 'transfer').eq('shift_id', newReq.shift_id);
  } else if (newReq.request_type === 'swap') {
    mirrorQuery = mirrorQuery
      .eq('request_type', 'swap')
      .eq('shift_id', newReq.target_shift_id || '00000000-0000-0000-0000-000000000000')
      .eq('target_shift_id', newReq.shift_id);
  } else {
    return NextResponse.json({ matched: false });
  }

  const { data: mirrorRows } = await mirrorQuery;
  const mirrorReq = mirrorRows?.[0];
  if (!mirrorReq) {
    return NextResponse.json({ matched: false });
  }

  // Same collision rules as manual accept — never force through a warning here.
  const collisionMsg = await checkSwapCollision(supa, newReq);
  if (collisionMsg) {
    return NextResponse.json({ matched: false });
  }

  const { data: acceptRows, error: acceptErr } = await supa.rpc('accept_matched_swap_pair_atomic', {
    p_new_swap_id: newReq.id,
    p_existing_swap_id: mirrorReq.id,
  });

  if (acceptErr) {
    console.error('[swap/auto-match] atomic accept error:', acceptErr);
    return NextResponse.json({ matched: false });
  }

  const acceptResult = Array.isArray(acceptRows) ? acceptRows[0] : acceptRows;
  if (!acceptResult?.ok) {
    return NextResponse.json({ matched: false });
  }

  // Notify both participants — neither of them clicked "accept," so both
  // should hear that the transaction went through.
  const requesterName = newReq.requester?.nickname || newReq.requester?.f_name || 'เพื่อนร่วมงาน';
  const targetName = newReq.target_user?.nickname || newReq.target_user?.f_name || 'เพื่อนร่วมงาน';
  const title = '🤝 จับคู่คำขอสำเร็จอัตโนมัติ';
  const bodyFor = (otherName: string) => newReq.request_type === 'swap'
    ? `ระบบตรวจพบว่าคุณกับ ${otherName} ต่างขอแลกเวรกัน จึงดำเนินการให้อัตโนมัติ — แลกเวรสำเร็จแล้ว`
    : `ระบบตรวจพบว่าคุณกับ ${otherName} ต่างส่งคำขอที่ตรงกัน จึงดำเนินการให้อัตโนมัติ — ${fmtShift(newReq.shift)} เปลี่ยนเจ้าของเรียบร้อยแล้ว`;

  const recipients = [
    { userId: newReq.requester_id, body: bodyFor(targetName) },
    { userId: newReq.target_user_id, body: bodyFor(requesterName) },
  ];

  for (const r of recipients) {
    sendPushToUser(r.userId, {
      title, body: r.body, url: '/calendar', tag: `swap-automatch-${mirrorReq.id}`,
    }).catch(() => {});
  }

  await supa.from('notifications').insert(
    recipients.map(r => ({ user_id: r.userId, type: 'swap_result', title, body: r.body, url: '/calendar' }))
  );

  const autoRejectedIds = (acceptResult.auto_rejected_ids || []) as string[];
  await notifyAutoRejected(supa, autoRejectedIds, [newReq.requester_id, newReq.target_user_id], newReq.shift);

  return NextResponse.json({ matched: true });
}
