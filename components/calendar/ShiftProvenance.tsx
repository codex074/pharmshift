'use client';

import { useEffect, useState } from 'react';
import { User, Building2, ArrowRightLeft, UserCheck, GitBranch, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { Shift } from '@/lib/types';

interface SwapHistory {
  request_type: 'swap' | 'transfer' | 'cover';
  updated_at: string;
}

const typeLabel = {
  swap: 'แลกเวร',
  transfer: 'รับเวร',
  cover: 'รับเวร',
};
const typeIcon = {
  swap: <ArrowRightLeft className="w-3.5 h-3.5" />,
  transfer: <GitBranch className="w-3.5 h-3.5" />,
  cover: <UserCheck className="w-3.5 h-3.5" />,
};
const typeColor = {
  swap: 'bg-blue-50 text-blue-700 border-blue-200',
  transfer: 'bg-violet-50 text-violet-700 border-violet-200',
  cover: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

/**
 * Shows where a shift came from — original owner + most recent accepted
 * swap/transfer/cover. Reused by ShiftDetailModal and SwapModal (transfer mode).
 */
export function ShiftProvenance({ shift, currentUserId }: { shift: Shift; currentUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [history, setHistory] = useState<SwapHistory | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchHistory() {
      setLoading(true);

      if (shift.original_user_id && shift.original_user_id !== currentUserId) {
        const { data: origUser } = await supabase
          .from('users')
          .select('f_name, nickname')
          .eq('id', shift.original_user_id)
          .single();
        if (active) setOriginalName(origUser ? ((origUser as any).nickname || (origUser as any).f_name || null) : null);
      } else if (active) {
        setOriginalName(null);
      }

      const { data: reqs } = await supabase
        .from('swap_requests')
        .select('request_type, status, updated_at')
        .eq('shift_id', shift.id)
        .eq('status', 'accepted')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (active) {
        setHistory(reqs && reqs.length > 0
          ? { request_type: (reqs[0] as any).request_type, updated_at: (reqs[0] as any).updated_at }
          : null);
        setLoading(false);
      }
    }

    fetchHistory();
    return () => { active = false; };
  }, [shift.id, shift.original_user_id, currentUserId]);

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

      {isOriginallyMine && !history ? (
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

          {history && (
            <div className={cn('flex items-center gap-3 p-3 rounded-xl border', typeColor[history.request_type])}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/60">
                {typeIcon[history.request_type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{typeLabel[history.request_type]}</span>
                  <span className="text-[10px] text-gray-400">เมื่อวันที่ {format(new Date(history.updated_at), 'd/M/yy')}</span>
                </div>
              </div>
            </div>
          )}

          {!isOriginallyMine && !history && (
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
