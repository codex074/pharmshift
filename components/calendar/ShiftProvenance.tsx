'use client';

import { useEffect, useState } from 'react';
import { User, Building2, ArrowRightLeft, UserCheck, GitBranch, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { Shift } from '@/lib/types';
import { provenancePhrase, resolveSwapDirection, swapPartyName, type SwapDirectionRow } from '@/lib/shiftHistory';

interface Hop {
  id: string;
  requestType: string;
  fromId?: string;
  toId?: string;
  fromName: string;
  toName: string;
  toIsViewer: boolean;
  updatedAt: string;
}

const typeIcon: Record<string, JSX.Element> = {
  swap: <ArrowRightLeft className="w-3.5 h-3.5" />,
  transfer: <GitBranch className="w-3.5 h-3.5" />,
  cover: <UserCheck className="w-3.5 h-3.5" />,
};
const typeColor: Record<string, string> = {
  swap: 'bg-blue-50 text-blue-700 border-blue-200',
  transfer: 'bg-violet-50 text-violet-700 border-violet-200',
  cover: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const HOP_SELECT = `
  id, request_type, status, shift_id, target_shift_id, updated_at,
  requester:users!requester_id(id, f_name, nickname),
  target_user:users!target_user_id(id, f_name, nickname)
`;

/**
 * Shows where a shift came from — original owner plus every accepted
 * swap/transfer/cover it went through, naming the other party each time.
 * Reused by ShiftDetailModal and SwapModal (transfer mode).
 */
export function ShiftProvenance({ shift, currentUserId }: { shift: Shift; currentUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [hops, setHops] = useState<Hop[]>([]);

  // The month fetch already joins original_user; only look it up when it wasn't included.
  const joinedOriginalName = shift.original_user
    ? (shift.original_user.nickname || shift.original_user.f_name || null)
    : null;

  useEffect(() => {
    let active = true;
    async function fetchHistory() {
      setLoading(true);

      if (shift.original_user_id && shift.original_user_id !== currentUserId) {
        if (joinedOriginalName) {
          if (active) setOriginalName(joinedOriginalName);
        } else {
          const { data: origUser } = await supabase
            .from('users')
            .select('f_name, nickname')
            .eq('id', shift.original_user_id)
            .single();
          if (active) setOriginalName(origUser ? ((origUser as any).nickname || (origUser as any).f_name || null) : null);
        }
      } else if (active) {
        setOriginalName(null);
      }

      // Both sides of a swap: this shift as the one requested, and as the counter-offer.
      const { data: reqs } = await supabase
        .from('swap_requests')
        .select(HOP_SELECT)
        .or(`shift_id.eq.${shift.id},target_shift_id.eq.${shift.id}`)
        .eq('status', 'accepted')
        .order('updated_at', { ascending: true });

      if (active) {
        const all = (reqs || []).map((r) => {
          const row = r as unknown as SwapDirectionRow & { id: string; updated_at: string };
          const { fromUser, toUser } = resolveSwapDirection(row, shift.id);
          return {
            id: row.id,
            requestType: row.request_type,
            fromId: fromUser?.id,
            toId: toUser?.id,
            fromName: swapPartyName(fromUser),
            toName: swapPartyName(toUser),
            toIsViewer: toUser?.id === currentUserId,
            updatedAt: row.updated_at,
          };
        });
        // An auto-matched pair (accept_matched_swap_pair_atomic) accepts a transfer and
        // its mirrored cover, i.e. two rows for one hand-off — show it once.
        setHops(all.filter((hop, i) => {
          const prev = all[i - 1];
          return !prev || prev.fromId !== hop.fromId || prev.toId !== hop.toId;
        }));
        setLoading(false);
      }
    }

    fetchHistory();
    return () => { active = false; };
  }, [shift.id, shift.original_user_id, joinedOriginalName, currentUserId]);

  const isOriginallyMine = !shift.original_user_id || shift.original_user_id === currentUserId;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">ที่มาของเวร</p>

      {isOriginallyMine && hops.length === 0 ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-slate-50 border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-700">ได้รับมอบหมายตั้งแต่ประกาศตารางเวร</p>
        </div>
      ) : (
        <div className="space-y-2">
          {!isOriginallyMine && originalName && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400">เจ้าของเดิม</p>
                <p className="text-sm font-medium text-gray-700">{originalName}</p>
              </div>
            </div>
          )}

          {hops.map((hop) => (
            <div key={hop.id} className={cn('flex items-center gap-3 p-3 rounded-xl border', typeColor[hop.requestType] || typeColor.swap)}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/60">
                {typeIcon[hop.requestType] || typeIcon.swap}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">
                  {hop.toIsViewer
                    ? provenancePhrase(hop.requestType, hop.fromName)
                    : `${hop.fromName} → ${hop.toName}`}
                </p>
                <p className="text-[10px] text-gray-400">เมื่อวันที่ {format(new Date(hop.updatedAt), 'd/M/yy')}</p>
              </div>
            </div>
          ))}

          {!isOriginallyMine && hops.length === 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">ได้รับเวรมาจากการโอน/แลก</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
