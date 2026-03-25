'use client';

import { useEffect, useState } from 'react';
import { X, Calendar, Building2, Moon, Sun, User, ArrowRightLeft, UserCheck, GitBranch, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { DEPT_STYLES } from '@/lib/types';
import type { Shift, SwapRequest } from '@/lib/types';

interface SwapHistory {
  request_type: 'swap' | 'transfer' | 'cover';
  updated_at: string;
  from_name: string; // who gave this shift to the current holder
}

interface ShiftDetailModalProps {
  shift: Shift;
  currentUserId: string;
  onClose: () => void;
  swapRequests?: SwapRequest[];
  onSwapRequest?: (shift: Shift) => void;
}

export function ShiftDetailModal({ shift, currentUserId, onClose, swapRequests, onSwapRequest }: ShiftDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [history, setHistory] = useState<SwapHistory | null>(null);

  const shiftDate = new Date(shift.date + 'T00:00:00');
  const deptName = (shift.department as any)?.name || shift.department_name || '';
  const displayDeptName = shift.position
    ? `${deptName} (${shift.position})`
    : deptName;

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);

      // 1. Get original owner's name if different from current user
      if (shift.original_user_id && shift.original_user_id !== currentUserId) {
        const { data: origUser } = await supabase
          .from('users')
          .select('f_name, nickname')
          .eq('id', shift.original_user_id)
          .single();
        if (origUser) {
          setOriginalName((origUser as any).nickname || (origUser as any).f_name || null);
        }
      }

      // 2. Find the most recent accepted swap_request for this shift
      // Case A: current user is the target who accepted (transfer/cover/swap receiving end)
      // Case B: current user is the requester who offered and got accepted (swap — they get target's shift)
      const { data: reqs } = await supabase
        .from('swap_requests')
        .select(`
          id, request_type, status, updated_at,
          requester:users!requester_id(f_name, nickname),
          target_user:users!target_user_id(f_name, nickname)
        `)
        .eq('shift_id', shift.id)
        .eq('status', 'accepted')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (reqs && reqs.length > 0) {
        const req = reqs[0] as any;
        // Determine who "gave" this shift to currentUser
        let fromName = '';
        if (req.request_type === 'swap') {
          // The target_user accepted — requester gets shift_id (target's shift)
          // So currentUser should be the requester; from = target_user
          fromName = req.target_user?.nickname || req.target_user?.f_name || '?';
        } else {
          // transfer / cover: new owner = requester (cover) or target_user (transfer)
          // figure out who is the "giver"
          if (req.target_user_id === currentUserId) {
            // transfer: currentUser accepted and received — from = requester
            fromName = req.requester?.nickname || req.requester?.f_name || '?';
          } else {
            // cover: currentUser is the requester who got it — from = target_user (original owner)
            fromName = req.target_user?.nickname || req.target_user?.f_name || '?';
          }
        }
        setHistory({
          request_type: req.request_type,
          updated_at: req.updated_at,
          from_name: fromName,
        });
      }

      setLoading(false);
    }

    fetchHistory();
  }, [shift.id, shift.original_user_id, currentUserId]);

  const isOriginallyMine = !shift.original_user_id || shift.original_user_id === currentUserId;

  const typeLabel = {
    swap: 'แลกเวร',
    transfer: 'รับโอนเวร',
    cover: 'อยู่เวรแทน',
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-slide-up sm:animate-fade-in">
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm">รายละเอียดเวร</h2>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Shift info */}
          <div className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              {shift.shift_type === 'ดึก' || shift.shift_type === 'รุ่งอรุณ'
                ? <Moon className="w-4 h-4 text-violet-200" />
                : <Sun className="w-4 h-4 text-yellow-200" />}
              <span className="font-bold text-base">{shift.shift_type}</span>
              {deptName && deptName !== shift.shift_type && (
                <span className="text-violet-200 text-sm">{displayDeptName}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-violet-100 text-sm">
              <Calendar className="w-3.5 h-3.5" />
              <span>{format(shiftDate, 'EEEE d MMMM yyyy', { locale: th })}</span>
            </div>
          </div>

          {/* Provenance */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">ที่มาของเวร</p>

              {isOriginallyMine && !history ? (
                /* Originally assigned — no swaps */
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">มอบหมายตั้งแต่ประกาศตารางเวร</p>
                    <p className="text-xs text-gray-400">เวรนี้ถูกกำหนดให้คุณตั้งแต่ต้น</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Original owner (if different) */}
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

                  {/* Last transfer event */}
                  {history && (
                    <div className={cn('flex items-center gap-3 p-3 rounded-xl border', typeColor[history.request_type])}>
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', typeColor[history.request_type])}>
                        {typeIcon[history.request_type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold">{typeLabel[history.request_type]}</span>
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(history.updated_at), 'd/M/yy')}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {history.request_type === 'swap' ? 'แลกกับ' : 'รับจาก'} {history.from_name}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Fallback if original differs but no accepted request found */}
                  {!isOriginallyMine && !history && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-sm text-amber-700">ได้รับเวรมาจากการโอน/แลก</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Improvement 5: Action Footer ── */}
        {onSwapRequest && (() => {
          const myPending = swapRequests?.find(
            r => r.shift_id === shift.id && r.status === 'pending' && r.requester_id === currentUserId
          );
          return (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              {myPending ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-base">⏳</span>
                  <p className="text-sm text-amber-700 font-medium flex-1">มีคำขอรออยู่ระหว่างดำเนินการ</p>
                </div>
              ) : (
                <button
                  onClick={() => { onClose(); onSwapRequest(shift); }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  ส่งคำขอแลก/โอนเวร
                </button>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
