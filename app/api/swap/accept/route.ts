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

function dateOffsetDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function hasBaiDuekSeq(
  supa: any,
  userId: string,
  shiftType: string,
  date: string,
  excludeShiftId?: string,
): Promise<boolean> {
  if (shiftType !== 'บ่าย' && shiftType !== 'ดึก') return false;
  const paired = shiftType === 'ดึก' ? 'บ่าย' : 'ดึก';
  const { data } = await supa.from('shifts').select('id, shift_type')
    .eq('user_id', userId).eq('date', date);
  return (data || []).some((s: any) => {
    if (excludeShiftId && s.id === excludeShiftId) return false;
    return s.shift_type === paired;
  });
}

async function hasDuekChaoSeq(
  supa: any,
  userId: string,
  shiftType: string,
  date: string,
  excludeShiftId?: string,
): Promise<boolean> {
  if (shiftType !== 'เช้า' && shiftType !== 'รุ่งอรุณ' && shiftType !== 'ดึก') return false;
  const isAfterDuek = shiftType === 'เช้า' || shiftType === 'รุ่งอรุณ';
  const adjDate = isAfterDuek ? dateOffsetDays(date, -1) : dateOffsetDays(date, 1);
  const { data } = await supa.from('shifts').select('id, shift_type')
    .eq('user_id', userId).eq('date', adjDate);
  return (data || []).some((s: any) => {
    if (excludeShiftId && s.id === excludeShiftId) return false;
    if (isAfterDuek) return s.shift_type === 'ดึก';
    return s.shift_type === 'เช้า' || s.shift_type === 'รุ่งอรุณ';
  });
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
  //    Level 1 (overlap)  → hard block, ไม่ว่า force จะส่งมาหรือไม่
  //    Level 2 (sequence) → soft warn, recipient กดยืนยัน (force=true) ได้
  let overlapMsg = '';
  let seqMsg = '';

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
      overlapMsg = 'ผู้ขอมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
    if ((r2.data || []).some((s: any) => shiftsOverlap(s.shift_type, req.target_shift.shift_type))) {
      overlapMsg = overlapMsg ? 'ทั้งสองฝ่ายมีเวรที่ทับซ้อนกัน' : 'ผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
    // Sequence check (Level 2) — บ่าย→ดึก, ดึก→เช้า
    const [seqBDR, seqBDT, seqDCR, seqDCT] = await Promise.all([
      hasBaiDuekSeq(supa, req.requester_id, req.shift.shift_type, req.shift.date, req.target_shift_id || undefined),
      hasBaiDuekSeq(supa, req.target_user_id, req.target_shift.shift_type, req.target_shift.date, req.shift.id),
      hasDuekChaoSeq(supa, req.requester_id, req.shift.shift_type, req.shift.date, req.target_shift_id || undefined),
      hasDuekChaoSeq(supa, req.target_user_id, req.target_shift.shift_type, req.target_shift.date, req.shift.id),
    ]);
    const seqMsgs: string[] = [];
    if (seqBDR && seqBDT) seqMsgs.push('ทั้งสองฝ่ายมีเวรบ่าย-ดึกต่อเนื่องกัน');
    else if (seqBDR) seqMsgs.push('ผู้ขอมีเวรบ่าย-ดึกต่อเนื่องกันในวันดังกล่าว');
    else if (seqBDT) seqMsgs.push('ผู้รับเวรมีเวรบ่าย-ดึกต่อเนื่องกันในวันดังกล่าว');
    if (seqDCR && seqDCT) seqMsgs.push('ทั้งสองฝ่ายมีเวรดึก-เช้าต่อเนื่องกัน');
    else if (seqDCR) seqMsgs.push('ผู้ขอมีเวรดึก-เช้าต่อเนื่องกัน');
    else if (seqDCT) seqMsgs.push('ผู้รับเวรมีเวรดึก-เช้าต่อเนื่องกัน');
    if (seqMsgs.length > 0) seqMsg = seqMsgs.join(' และ ');
  } else if (req.shift) {
    const currentOwnerId = req.shift.user_id;
    const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
    const { data: newUserShifts } = await supa.from('shifts').select('id, shift_type')
      .eq('user_id', newUserId).eq('date', req.shift.date);
    if ((newUserShifts || []).some((s: any) => shiftsOverlap(s.shift_type, req.shift.shift_type))) {
      overlapMsg = 'ผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
    // Sequence check (Level 2)
    const [hasBD, hasDC] = await Promise.all([
      hasBaiDuekSeq(supa, newUserId, req.shift.shift_type, req.shift.date),
      hasDuekChaoSeq(supa, newUserId, req.shift.shift_type, req.shift.date),
    ]);
    const seqMsgs: string[] = [];
    if (hasBD) seqMsgs.push('ผู้รับเวรมีเวรบ่าย-ดึกต่อเนื่องกันในวันดังกล่าว');
    if (hasDC) seqMsgs.push('ผู้รับเวรมีเวรดึก-เช้าต่อเนื่องกัน');
    if (seqMsgs.length > 0) seqMsg = seqMsgs.join(' และ ');
  }

  // Level 1 — hard block (force ไม่สามารถข้ามได้)
  if (overlapMsg) {
    return NextResponse.json(
      { error: `ไม่สามารถรับคำขอนี้ได้ — ${overlapMsg}` },
      { status: 409 },
    );
  }

  // Level 2 — warn, ให้ recipient กดยืนยันได้
  if (seqMsg && !force) {
    return NextResponse.json({ collision: seqMsg });
  }

  const collisionMsg = seqMsg;

  // 4) Accept atomically in the database to prevent double-accept races
  const { data: acceptRows, error: acceptErr } = await supa.rpc('accept_swap_request_atomic', {
    p_swap_id: req.id,
    p_actor_user_id: session.id,
  });
  if (acceptErr) {
    console.error('[swap/accept] atomic accept error:', acceptErr);
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

  // 6) Notify requests auto-rejected by the atomic accept
  const autoRejectedIds = (acceptResult.auto_rejected_ids || []) as string[];
  if (autoRejectedIds.length) {
    const { data: otherPending } = await supa
      .from('swap_requests')
      .select('id, requester_id, target_user_id')
      .in('id', autoRejectedIds);

    const involvedIds = new Set([req.requester_id, req.target_user_id]);
    const notifyIds = Array.from(
      new Set(
        (otherPending || [])
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
