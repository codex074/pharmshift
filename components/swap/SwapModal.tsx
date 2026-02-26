'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRightLeft, User, Calendar, Building2, Moon, Sun, Loader2, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Shift, User as UserType } from '@/lib/types';
import { DEPT_STYLES, SHIFT_STYLES } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface SwapModalProps {
  shift: Shift | null;
  currentUser: UserType | null;
  onClose: () => void;
}

export function SwapModal({ shift, currentUser, onClose }: SwapModalProps) {
  const [users, setUsers] = useState<UserType[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(true);
  
  const [requestType, setRequestType] = useState<'swap' | 'transfer'>('swap');
  const [targetShifts, setTargetShifts] = useState<Shift[]>([]);
  const [fetchingShifts, setFetchingShifts] = useState(false);
  const [selectedTargetShift, setSelectedTargetShift] = useState<Shift | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!shift) return;
    setFetchingUsers(true);
    supabase
      .from('users')
      .select('*')
      .eq('role', 'pharmacist')
      .neq('id', shift.user_id)
      .order('name')
      .then(({ data }) => {
        setUsers(data as UserType[] || []);
        setFetchingUsers(false);
      });
  }, [shift]);

  // Fetch shifts for the secondary selection in 'swap' mode
  useEffect(() => {
    if (!shift || !currentUser || requestType !== 'swap') {
      setTargetShifts([]);
      setSelectedTargetShift(null);
      return;
    }

    const isOwnShift = currentUser.id === shift.user_id;
    let fetchUserId: string | undefined;

    if (isOwnShift) {
      if (!selectedUser) {
        setTargetShifts([]);
        return;
      }
      fetchUserId = selectedUser.id; // Fetch target user's shifts
    } else {
      fetchUserId = currentUser.id; // Fetch my own shifts to offer
    }

    setFetchingShifts(true);
    // Derive month_year from shift (fall back to parsing the date)
    let monthYear = shift.month_year;
    if (!monthYear) {
      const d = new Date(shift.date + 'T00:00:00');
      monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    supabase
      .from('shifts')
      .select('*, department:departments(id, name)')
      .eq('user_id', fetchUserId)
      .eq('month_year', monthYear)
      .order('date')
      .then(({ data }) => {
        setTargetShifts(data as Shift[] || []);
        setFetchingShifts(false);
      });
  }, [shift, currentUser, requestType, selectedUser]);

  // Clear error when inputs change
  useEffect(() => {
    setSubmitError(null);
  }, [requestType, selectedUser, selectedTargetShift]);

  if (!shift || !currentUser) return null;

  const deptName = (shift.department as { name: string })?.name || '';
  const shiftOwner = (shift.user as { name: string; nickname?: string });
  const ownerLabel = shiftOwner?.nickname || shiftOwner?.name || '—';
  const shiftDate = new Date(shift.date + 'T00:00:00');
  const isOwnShift = currentUser.id === shift.user_id;

  async function handleRequestSwap() {
    if (!currentUser || !shift) return;

    setLoading(true);
    setSubmitError(null);
    try {
      let submitShiftId: string;
      let submitTargetShiftId: string | undefined;
      let submitTargetUserId: string;

      if (requestType === 'transfer') {
        if (isOwnShift) {
          if (!selectedUser) throw new Error("กรุณาเลือกเภสัชกรปลายทาง");
          submitTargetUserId = selectedUser.id;
        } else {
          submitTargetUserId = shift.user_id;
        }
        submitShiftId = shift.id;
      } else {
        // Swap
        if (!selectedTargetShift) throw new Error("กรุณาเลือกเวรที่จะแลก");
        if (isOwnShift) {
          if (!selectedUser) throw new Error("กรุณาเลือกเภสัชกรปลายทาง");
          submitTargetUserId = selectedUser.id;
          submitShiftId = shift.id;
          submitTargetShiftId = selectedTargetShift.id;
        } else {
          submitTargetUserId = shift.user_id;
          // When !isOwnShift, I am offering my shift to take theirs
          submitShiftId = selectedTargetShift.id;
          submitTargetShiftId = shift.id;
        }
      }

      // Pre-submission Shift Collision Validation
      const checks = [];

      if (requestType === 'transfer') {
        const newOwnerId = isOwnShift ? submitTargetUserId : currentUser.id;
        checks.push(
          supabase
            .from('shifts')
            .select('id')
            .eq('user_id', newOwnerId)
            .eq('date', shift.date)
            .eq('shift_type', shift.shift_type)
            .maybeSingle()
        );
      } else if (requestType === 'swap' && selectedTargetShift) {
        // Target User receives `submitShiftId` (whose data is contextShift1)
        const contextShift1 = isOwnShift ? shift : selectedTargetShift;
        checks.push(
          supabase
            .from('shifts')
            .select('id')
            .eq('user_id', submitTargetUserId)
            .eq('date', contextShift1.date)
            .eq('shift_type', contextShift1.shift_type)
            .neq('id', submitTargetShiftId || 'dummy') // Exclude the shift they give away
            .maybeSingle()
        );

        // Current User receives `submitTargetShiftId` (whose data is contextShift2)
        const contextShift2 = isOwnShift ? selectedTargetShift : shift;
        checks.push(
          supabase
            .from('shifts')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('date', contextShift2.date)
            .eq('shift_type', contextShift2.shift_type)
            .neq('id', submitShiftId) // Exclude the shift they give away
            .maybeSingle()
        );
      }

      const checkResults = await Promise.all(checks);
      for (const res of checkResults) {
        if (res.data) {
          throw new Error("ไม่สามารถดำเนินการได้ เนื่องจากมีเวรประเภทเดียวกันในวันดังกล่าวอยู่แล้ว (Shift Collision)");
        }
      }

      const { error } = await supabase.from('swap_requests').insert({
        shift_id: submitShiftId,
        target_shift_id: submitTargetShiftId || null,
        requester_id: currentUser.id,
        target_user_id: submitTargetUserId,
        request_type: requestType,
        message: message.trim() || null,
        status: 'pending',
      });

      if (error) throw error;
      toast.success('ส่งคำขอเรียบร้อยแล้ว');
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      toast.error('เกิดข้อผิดพลาด', { description: err.message });
    } finally {
      setLoading(false);
    }
  }

  const isValidSubmit = () => {
    if (requestType === 'transfer') {
      if (isOwnShift && !selectedUser) return false;
      return true;
    } else {
      if (isOwnShift && (!selectedUser || !selectedTargetShift)) return false;
      if (!isOwnShift && !selectedTargetShift) return false;
      return true;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card rounded-2xl shadow-2xl w-full max-w-md animate-fade-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="font-semibold text-gray-900">จัดการเวร</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Tabs */}
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => { setRequestType('swap'); setSelectedTargetShift(null); }}
              className={cn("flex-1 py-1.5 text-sm font-medium rounded-lg transition-all", requestType==='swap' ? "bg-white shadow text-violet-700" : "text-gray-500 hover:text-gray-700")}
            >
              แลกเวร
            </button>
            <button
              onClick={() => { setRequestType('transfer'); setSelectedTargetShift(null); }}
              className={cn("flex-1 py-1.5 text-sm font-medium rounded-lg transition-all", requestType==='transfer' ? "bg-white shadow text-violet-700" : "text-gray-500 hover:text-gray-700")}
            >
              {isOwnShift ? 'ยก/ขายเวร' : 'ขอรับ/ซื้อเวร'}
            </button>
          </div>

          {/* Shift Info */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {isOwnShift ? 'เวรของคุณ' : 'เวรที่เลือก'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {format(shiftDate, 'd MMM yyyy', { locale: th })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {shift.shift_type === 'ดึก' ? (
                  <Moon className="w-3.5 h-3.5 text-violet-500" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="text-sm text-gray-700">{shift.shift_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    DEPT_STYLES[deptName]?.text || 'text-gray-600'
                  )}
                >
                  {deptName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-700">{ownerLabel}</span>
              </div>
            </div>
          </div>

          {/* Select User if needed (Own shift, and need target user) */}
          {isOwnShift && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                เลือกเภสัชกรปลายทาง
              </h3>
              {fetchingUsers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setSelectedUser(u.id === selectedUser?.id ? null : u); setSelectedTargetShift(null); }}
                      className={cn(
                        'p-2 rounded-lg border text-left transition-all duration-150',
                        selectedUser?.id === u.id
                          ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {u.prefix}{u.nickname || u.name}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Informational for Transfer In */}
          {!isOwnShift && requestType === 'transfer' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-700">
                คุณจะส่งคำขอรับเวรนี้จาก <strong>{ownerLabel}</strong>
              </p>
            </div>
          )}

          {/* Target Shifts Selection for Swapping */}
          {requestType === 'swap' && (!isOwnShift || selectedUser) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {isOwnShift ? 'เลือกเวรที่ต้องการแลกด้วย' : 'เลือกเวรของคุณเพื่อเสนอแลก'}
              </h3>
              {fetchingShifts ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : targetShifts.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-100">
                  ไม่พบเวรที่สามารถแลกได้ในเดือนนี้
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {targetShifts.map(s => {
                    const sDept = (s.department as { name: string })?.name || '';
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedTargetShift(s.id === selectedTargetShift?.id ? null : s)}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all duration-150 flex items-center justify-between',
                          selectedTargetShift?.id === s.id
                            ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900 w-24">
                            {format(new Date(s.date + 'T00:00:00'), 'd MMM', { locale: th })}
                          </span>
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md', DEPT_STYLES[sDept]?.bg, DEPT_STYLES[sDept]?.text)}>
                            {sDept}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-xs">{s.shift_type}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Inline error */}
          {submitError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Message */}
          <div className="space-y-1.5 shrink-0 pt-2 border-t border-gray-100">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              หมายเหตุ <span className="text-gray-400 normal-case">(ไม่บังคับ)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-5 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleRequestSwap}
            disabled={loading || !isValidSubmit()}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            ส่งคำขอ
          </button>
        </div>
      </div>
    </div>
  );
}
