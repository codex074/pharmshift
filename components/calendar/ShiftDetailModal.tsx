'use client';

import { useEffect, useState } from 'react';
import { X, Calendar, Building2, Moon, Sun, User, ArrowRightLeft, UserCheck, GitBranch, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { DEPT_STYLES } from '@/lib/types';
import type { Shift } from '@/lib/types';

interface SwapHistory {
  request_type: 'swap' | 'transfer' | 'cover';
  updated_at: string;
  from_name: string; // who gave this shift to the current holder
}

interface ShiftDetailModalProps {
  shift: Shift;
  currentUserId: string;
  onClose: () => void;
}

export function ShiftDetailModal({ shift, currentUserId, onClose }: ShiftDetailModalProps) {
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

  // Shift-type colour palette (matching CalendarGrid)
  const shiftTheme =
    shift.shift_type === 'เช้า'     ? { bg: '#E8F9FA', border: '#9FDCE0', text: 'text-teal-900',   icon: 'text-teal-600',   spinnerCls: 'text-teal-400',   hdrIcon: <Sun  className="w-4 h-4 text-teal-600"   /> } :
    shift.shift_type === 'บ่าย'     ? { bg: '#F3EDF8', border: '#9E76B4', text: 'text-purple-900', icon: 'text-purple-600', spinnerCls: 'text-purple-400', hdrIcon: <Sun  className="w-4 h-4 text-purple-500" /> } :
    shift.shift_type === 'ดึก'      ? { bg: '#EEF0FF', border: '#99ABFF', text: 'text-indigo-900', icon: 'text-indigo-600', spinnerCls: 'text-indigo-400', hdrIcon: <Moon className="w-4 h-4 text-indigo-500" /> } :
    shift.shift_type === 'รุ่งอรุณ' ? { bg: '#FEF3DC', border: '#FFCA72', text: 'text-amber-900',  icon: 'text-amber-600',  spinnerCls: 'text-amber-400',  hdrIcon: <Moon className="w-4 h-4 text-amber-500"  /> } :
                                      { bg: '#F3EDF8', border: '#9E76B4', text: 'text-purple-900', icon: 'text-purple-600', spinnerCls: 'text-purple-400', hdrIcon: <Calendar className="w-4 h-4 text-purple-500" /> };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-slide-up sm:animate-fade-in overflow-hidden">
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header — tinted with shift colour */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ backgroundColor: shiftTheme.bg, borderColor: shiftTheme.border }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center">
              {shiftTheme.hdrIcon}
            </div>
            <div>
              <h2 className={cn('font-bold text-sm', shiftTheme.text)}>{shift.shift_type}{deptName && deptName !== shift.shift_type ? ` · ${displayDeptName}` : ''}</h2>
              <p className="text-[11px] text-gray-500">{format(shiftDate, 'EEEE d MMMM yyyy', { locale: th })}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/70 text-gray-400 hover:text-red-500 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Provenance */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className={cn('w-5 h-5 animate-spin', shiftTheme.spinnerCls)} />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">ที่มาของเวร</p>

              {isOriginallyMine && !history ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: shiftTheme.bg, borderColor: shiftTheme.border }}>
                  <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
                    <User className={cn('w-4 h-4', shiftTheme.icon)} />
                  </div>
                  <div>
                    <p className={cn('text-sm font-medium', shiftTheme.text)}>มอบหมายตั้งแต่ประกาศตารางเวร</p>
                    <p className="text-xs text-gray-400">เวรนี้ถูกกำหนดให้คุณตั้งแต่ต้น</p>
                  </div>
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
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/60')}>
                        {typeIcon[history.request_type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold">{typeLabel[history.request_type]}</span>
                          <span className="text-[10px] text-gray-400">
                            {history.request_type === 'swap' ? 'แลกเมื่อวันที่ ' : 'รับเวรเมื่อวันที่ '}{format(new Date(history.updated_at), 'd/M/yy')}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {history.request_type === 'swap' ? 'แลกกับ' : 'รับจาก'} {history.from_name}
                        </p>
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
          )}
        </div>

      </div>
    </div>
  );
}
