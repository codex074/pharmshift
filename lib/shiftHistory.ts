// Direction of a swap/transfer/cover request, from the point of view of ONE shift.
// Shared by the admin history route and the user-facing "ที่มาของเวร" card so the
// two can never disagree about who gave a shift and who received it.

export type SwapParty = { id?: string; f_name?: string | null; nickname?: string | null };

export type SwapDirectionRow = {
  request_type: string;
  shift_id: string | null;
  target_shift_id?: string | null;
  requester?: SwapParty | SwapParty[] | null;
  target_user?: SwapParty | SwapParty[] | null;
};

/** PostgREST returns an embedded row as either an object or a one-element array. */
function one(party: SwapParty | SwapParty[] | null | undefined): SwapParty | null {
  if (!party) return null;
  return Array.isArray(party) ? (party[0] ?? null) : party;
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
