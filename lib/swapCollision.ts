import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { deptDisplayLabelForRole, positionDisplayLabelForRole } from './types';

/**
 * Shared collision-detection helpers for swap/transfer/cover acceptance.
 * Used by both the manual accept route and the auto-match route so the
 * two paths apply identical overlap/sequence rules.
 */

export type ShiftType = 'เช้า' | 'บ่าย' | 'ดึก' | 'รุ่งอรุณ';

export const SHIFT_MINUTES: Record<ShiftType, { start: number; end: number }> = {
  'เช้า':     { start:  8 * 60 + 30, end: 16 * 60 + 30 },
  'บ่าย':     { start: 16 * 60 + 30, end: 23 * 60 + 59 },
  'ดึก':      { start: 24 * 60,      end: 32 * 60 + 30 },
  'รุ่งอรุณ': { start:  7 * 60,      end:  8 * 60 + 30 },
};

export function shiftsOverlap(a: ShiftType, b: ShiftType): boolean {
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

export function fmtShift(s: any): string {
  if (!s) return 'เวรดังกล่าว';
  const d = s.date ? format(new Date(s.date + 'T00:00:00'), 'd MMM', { locale: th }) : '';
  const role = s.user?.role;
  const rawDept = s.department?.name || '';
  const dept = rawDept && rawDept !== s.shift_type ? deptDisplayLabelForRole(role, rawDept) : '';
  const pos = positionDisplayLabelForRole(role, rawDept, s.position) || '';
  const area = [dept, pos].filter(Boolean).join(' ');
  return `เวร${s.shift_type}${d ? ` ${d}` : ''}${area ? ` (${area})` : ''}`;
}

interface CollisionCheckRequest {
  request_type: 'swap' | 'transfer' | 'cover';
  requester_id: string;
  target_user_id: string;
  shift_id: string;
  target_shift_id?: string | null;
  shift: { id: string; date: string; shift_type: string; user_id?: string } | null;
  target_shift?: { id: string; date: string; shift_type: string } | null;
}

/** Returns a combined, human-readable collision message, or '' if none. */
export async function checkSwapCollision(supa: any, req: CollisionCheckRequest): Promise<string> {
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
    if ((r1.data || []).some((s: any) => shiftsOverlap(s.shift_type, req.shift!.shift_type as ShiftType))) {
      overlapMsg = 'ผู้ขอมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
    if ((r2.data || []).some((s: any) => shiftsOverlap(s.shift_type, req.target_shift!.shift_type as ShiftType))) {
      overlapMsg = overlapMsg ? 'ทั้งสองฝ่ายมีเวรที่ทับซ้อนกัน' : 'ผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
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
    if ((newUserShifts || []).some((s: any) => shiftsOverlap(s.shift_type, req.shift!.shift_type as ShiftType))) {
      overlapMsg = 'ผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว';
    }
    const [hasBD, hasDC] = await Promise.all([
      hasBaiDuekSeq(supa, newUserId, req.shift.shift_type, req.shift.date),
      hasDuekChaoSeq(supa, newUserId, req.shift.shift_type, req.shift.date),
    ]);
    const seqMsgs: string[] = [];
    if (hasBD) seqMsgs.push('ผู้รับเวรมีเวรบ่าย-ดึกต่อเนื่องกันในวันดังกล่าว');
    if (hasDC) seqMsgs.push('ผู้รับเวรมีเวรดึก-เช้าต่อเนื่องกัน');
    if (seqMsgs.length > 0) seqMsg = seqMsgs.join(' และ ');
  }

  return [overlapMsg, seqMsg].filter(Boolean).join(' และ ');
}
