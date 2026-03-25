export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/session';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

// Service-role client — bypasses RLS, used for trusted server-side mutations
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/* ── Helpers ─────────────────────────────────────────────────────────── */

type ShiftType = 'เช้า' | 'บ่าย' | 'ดึก' | 'รุ่งอรุณ';

const SHIFT_MINUTES: Record<ShiftType, { start: number; end: number }> = {
  'เช้า':     { start:  8 * 60 + 30, end: 16 * 60 + 30 },
  'บ่าย':     { start: 16 * 60 + 30, end: 23 * 60 + 59 },
  'ดึก':      { start: 24 * 60,      end: 32 * 60 + 30 },
  'รุ่งอรุณ': { start:  7 * 60,      end:  8 * 60 + 30 },
};

function shiftsOverlap(a: ShiftType, b: ShiftType): boolean {
  if (a === b) return true;
  const ta = SHIFT_MINUTES[a];
  const tb = SHIFT_MINUTES[b];
  if (!ta || !tb) return false;
  return ta.start < tb.end && tb.start < ta.end;
}

function fmtShift(s: any): string {
  if (!s) return 'เวรดังกล่าว';
  const d = s.date ? format(new Date(s.date + 'T00:00:00'), 'd MMM', { locale: th }) : '';
  const dept = s.department?.name || '';
  return `เวร${s.shift_type}${d ? ` ${d}` : ''}${dept ? ` (${dept})` : ''}`;
}

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
  let collisionMsg = '';

  if (req.request_type === 'swap' && req.target_shift && req.shift) {
    const [r1, r2] = await Promise.all([
      supa.from('shifts').select('id, shift_type')
        .eq('user_id', req.requester_id)
        .eq('date', req.shift.date)
        .neq('id', req.target_shift_id || 'x'),
      supa.from('shifts').select('id, shift_type')
        .eq('user_id', req.target_user_id)
        .eq('date', req.target_shift.date)
        .neq('id', req.shift.id),
    ]);
    if ((r1.data || []).some((s: any) => shiftsOverlap(s.shift_type, req.shift.shift_type))) {
      collisionMsg = 'ผู้ขอมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
    if ((r2.data || []).some((s: any) => shiftsOverlap(s.shift_type, req.target_shift.shift_type))) {
      collisionMsg = collisionMsg ? 'ทั้งสองฝ่ายมีเวรที่ทับซ้อนกัน' : 'ผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
  } else if (req.shift) {
    const currentOwnerId = req.shift.user_id;
    const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
    const { data: newUserShifts } = await supa.from('shifts').select('id, shift_type')
      .eq('user_id', newUserId).eq('date', req.shift.date);
    if ((newUserShifts || []).some((s: any) => shiftsOverlap(s.shift_type, req.shift.shift_type))) {
      collisionMsg = 'ผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
  }

  if (collisionMsg && !force) {
    return NextResponse.json({ collision: collisionMsg });
  }

  // 4) Mark request as accepted
  const { error: statusErr } = await supa
    .from('swap_requests')
    .update({ status: 'accepted', requester_read: false })
    .eq('id', req.id);
  if (statusErr) {
    console.error('[swap/accept] status update error:', statusErr);
    return NextResponse.json({ error: 'ไม่สามารถอัปเดตสถานะได้' }, { status: 500 });
  }

  // 5) Exchange shift owners (SERVICE ROLE — guaranteed to succeed)
  if (req.request_type === 'swap' && req.target_shift_id) {
    const { error: e1 } = await supa.from('shifts')
      .update({ user_id: req.requester_id })
      .eq('id', req.shift_id);
    const { error: e2 } = await supa.from('shifts')
      .update({ user_id: req.target_user_id })
      .eq('id', req.target_shift_id);
    if (e1 || e2) {
      console.error('[swap/accept] shift update errors:', e1, e2);
      // Rollback status
      await supa.from('swap_requests').update({ status: 'pending', requester_read: true }).eq('id', req.id);
      return NextResponse.json({ error: 'ไม่สามารถสลับเจ้าของเวรได้' }, { status: 500 });
    }
  } else {
    const currentOwnerId = req.shift?.user_id;
    const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
    const { error: e1 } = await supa.from('shifts')
      .update({ user_id: newUserId })
      .eq('id', req.shift_id);
    if (e1) {
      console.error('[swap/accept] shift update error:', e1);
      await supa.from('swap_requests').update({ status: 'pending', requester_read: true }).eq('id', req.id);
      return NextResponse.json({ error: 'ไม่สามารถเปลี่ยนเจ้าของเวรได้' }, { status: 500 });
    }
  }

  // 6) Notifications
  const acceptorName = req.target_user?.nickname || req.target_user?.f_name || 'เพื่อนร่วมงาน';
  const acceptTitle = req.request_type === 'swap' ? '✅ แลกเวรสำเร็จ' : '✅ โอนเวรสำเร็จ';
  const acceptBody = req.request_type === 'swap'
    ? `${acceptorName} ยอมรับการแลกเวรแล้ว — คุณได้รับ ${fmtShift(req.shift)}`
    : `${acceptorName} รับ ${fmtShift(req.shift)} แล้ว`;

  // Push notification
  const baseUrl = request.nextUrl.origin;
  fetch(`${baseUrl}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: req.requester_id, title: acceptTitle, body: acceptBody,
      url: '/calendar', tag: `swap-${req.id}`,
    }),
  }).catch(() => {});

  // In-app notification
  await supa.from('notifications').insert({
    user_id: req.requester_id, type: 'swap_result',
    title: acceptTitle, body: acceptBody, url: '/calendar',
  });

  // 7) Auto-cancel other pending requests for the same shift(s)
  const shiftIds = [req.shift_id];
  if (req.target_shift_id) shiftIds.push(req.target_shift_id);

  const { data: otherPending } = await supa
    .from('swap_requests')
    .select('id, requester_id, target_user_id')
    .in('shift_id', shiftIds)
    .eq('status', 'pending')
    .neq('id', req.id);

  if (otherPending?.length) {
    await supa.from('swap_requests')
      .update({ status: 'rejected', requester_read: false })
      .in('id', otherPending.map((r: any) => r.id));

    const involvedIds = new Set([req.requester_id, req.target_user_id]);
    const notifyIds = Array.from(
      new Set(
        otherPending
          .flatMap((r: any) => [r.requester_id, r.target_user_id])
          .filter((id: string) => !involvedIds.has(id))
      )
    );

    if (notifyIds.length) {
      const autoCancelTitle = '⚠️ คำขอถูกยกเลิกอัตโนมัติ';
      const autoCancelBody = `${fmtShift(req.shift)} ถูกดำเนินการโดยผู้อื่นแล้ว คำขอของคุณจึงถูกยกเลิก`;
      fetch(`${baseUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: notifyIds, title: autoCancelTitle, body: autoCancelBody,
          url: '/calendar', tag: `swap-auto-cancel-${req.shift_id}`,
        }),
      }).catch(() => {});

      await supa.from('notifications').insert(
        notifyIds.map((uid: string) => ({
          user_id: uid, type: 'swap_result',
          title: autoCancelTitle, body: autoCancelBody, url: '/calendar',
        }))
      );
    }
  }

  return NextResponse.json({
    ok: true,
    collision: collisionMsg || undefined,
  });
}
