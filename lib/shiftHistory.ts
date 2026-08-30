// Direction of a swap/transfer/cover request, from the point of view of ONE shift.
// Shared by the admin history route and the user-facing "ที่มาของเวร" card so the
// two can never disagree about who gave a shift and who received it.

import { shiftHoverLabel } from './types';

export type SwapParty = { id?: string; f_name?: string | null; nickname?: string | null };

export type SwapShiftRef = {
  id?: string;
  date?: string;
  shift_type?: string;
  position?: string | null;
  department?: { name?: string | null } | { name?: string | null }[] | null;
  user?: { role?: string | null } | { role?: string | null }[] | null;
};

export type SwapDirectionRow = {
  request_type: string;
  shift_id: string | null;
  target_shift_id?: string | null;
  requester?: SwapParty | SwapParty[] | null;
  target_user?: SwapParty | SwapParty[] | null;
  shift?: SwapShiftRef | SwapShiftRef[] | null;
  target_shift?: SwapShiftRef | SwapShiftRef[] | null;
};

/** PostgREST returns an embedded row as either an object or a one-element array. */
function one<T>(embedded: T | T[] | null | undefined): T | null {
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

export function swapPartyName(party: SwapParty | SwapParty[] | null | undefined): string {
  const p = one(party);
  return p?.nickname || p?.f_name || '—';
}

/**
 * Who held THIS shift before/after the request, per request_type:
 * - transfer: shift_id belongs to the requester (giving it away).
 * - swap/cover, viewed via shift_id: shift_id belongs to the target
 *   (requester is the one receiving it).
 * - swap, viewed via target_shift_id (isCounterOffer): that shift
 *   belongs to the requester (mirror of the transfer case).
 */
export function resolveSwapDirection(row: SwapDirectionRow, shiftId: string) {
  const isCounterOffer = row.shift_id !== shiftId; // this shift was the requester's side of a 'swap'
  const requesterOwnsFirst = row.request_type === 'transfer' || isCounterOffer;
  return {
    isCounterOffer,
    fromUser: one(requesterOwnsFirst ? row.requester : row.target_user),
    toUser: one(requesterOwnsFirst ? row.target_user : row.requester),
  };
}

/** One hop worded from the receiver's side: "รับโอนจาก สมชาย". */
export function provenancePhrase(requestType: string, otherName: string): string {
  if (requestType === 'transfer') return `รับโอนจาก ${otherName}`;
  if (requestType === 'cover') return `อยู่เวรแทน ${otherName}`;
  return `แลกเวรกับ ${otherName}`;
}

/**
 * The shift that moved the other way in a swap — the one given up to get THIS
 * shift. Only a 'swap' has one; a transfer/cover moves a single shift.
 */
export function counterpartSwapShift(row: SwapDirectionRow, shiftId: string): SwapShiftRef | null {
  if (row.request_type !== 'swap') return null;
  const isCounterOffer = row.shift_id !== shiftId;
  return one(isCounterOffer ? row.shift : row.target_shift);
}

/** "แลกกับ บ่าย IPD ตำแหน่ง I1 12/8/26" — what was traded away, named the same way the grids name a shift. */
export function counterpartSwapLabel(shiftRef: SwapShiftRef | null): string {
  if (!shiftRef?.date) return '';
  const dept = one(shiftRef.department)?.name ?? '';
  const role = one(shiftRef.user)?.role ?? null;
  const [y, m, d] = shiftRef.date.split('-');
  return `แลกกับ ${shiftHoverLabel(role, shiftRef.shift_type, dept, shiftRef.position)} ${Number(d)}/${Number(m)}/${y.slice(2)}`;
}
