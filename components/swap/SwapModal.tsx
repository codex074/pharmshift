'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRightLeft, User, Calendar, Building2, Moon, Sun, Loader2, Search, AlertTriangle, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Shift, ShiftType, User as UserType, UserRole } from '@/lib/types';
import { DEPT_STYLES, ROLE_LABELS } from '@/lib/types';
import { cn, shiftsOverlap } from '@/lib/utils';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface SwapModalProps {
  shift: Shift | null;
  currentUser: UserType | null;
  publishedRoles: Record<string, boolean>;
  onClose: () => void;
}

export function SwapModal({ shift, currentUser, publishedRoles, onClose }: SwapModalProps) {
  const [users, setUsers] = useState<UserType[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collisionWarning, setCollisionWarning] = useState<string | null>(null);
  const [collisionConfirmed, setCollisionConfirmed] = useState(false);

  const ownerRoleForPublish: UserRole = ((shift?.user as any)?.role || currentUser?.role || 'pharmacist') as UserRole;
  const isMonthPublished = !!publishedRoles[ownerRoleForPublish];

  // Only allow opening for own shifts
  const isOwnShift = currentUser && shift ? currentUser.id === shift.user_id : false;

  useEffect(() => {
    if (!shift) return;
    const ownerRole: UserRole = (shift.user as any)?.role || currentUser?.role || 'pharmacist';
    setFetchingUsers(true);
    supabase
      .from('users')
      .select('*')
      .eq('role', ownerRole)
      .neq('id', shift.user_id)
      .neq('is_active', false)
      .neq('is_readonly', true)
      .order('f_name')
      .then(({ data, error }) => {
        if (!error) setUsers(data as UserType[] || []);
        setFetchingUsers(false);
      });
  }, [shift, currentUser]);

  useEffect(() => {
    setSubmitError(null);
    setCollisionWarning(null);
    setCollisionConfirmed(false);
  }, [selectedUser]);

  if (!shift || !currentUser || !isOwnShift) return null;

  const deptName = (shift.department as { name: string })?.name || '';
  const displayDeptName = shift.position ? `${deptName} ${shift.position === 'D/C' ? 'D/D' : shift.position}` : deptName;
  const shiftOwner = (shift.user as { f_name: string; nickname?: string; role?: UserRole; prefix?: string });
  const ownerLabel = shiftOwner?.nickname || shiftOwner?.f_name || '—';
  const ownerRole: UserRole = shiftOwner?.role || currentUser?.role || 'pharmacist';
  const roleName = ROLE_LABELS[ownerRole] || 'เภสัชกร';
  const shiftDate = new Date(shift.date + 'T00:00:00');

  async function handleSubmit() {
    if (!currentUser || !shift) return;
    if (!isMonthPublished) {
      setSubmitError('ตารางเวรเดือนนี้ยังไม่ได้ประกาศ ไม่สามารถโอนเวรได้');
      return;
    }
    if (!selectedUser) {
      setSubmitError(`กรุณาเลือก${roleName}ที่ต้องการให้มาอยู่แทน`);
      return;
    }

    setLoading(true);
    setSubmitError(null);
    try {
      // Check collision: target user has any overlapping shift on same date
      const { data: targetShifts } = await supabase
        .from('shifts')
        .select('id, shift_type')
        .eq('user_id', selectedUser.id)
        .eq('date', shift.date);

      const collidingShifts = (targetShifts || []).filter(s =>
        shiftsOverlap(s.shift_type as ShiftType, shift.shift_type as ShiftType)
      );

      if (collidingShifts.length > 0 && !collisionConfirmed) {
        const targetName = selectedUser.f_name || selectedUser.nickname || 'ปลายทาง';
        setCollisionWarning(`${targetName} มีเวรในช่วงเวลาเดียวกันอยู่แล้ว คุณต้องการส่งคำขอต่อหรือไม่?`);
        setLoading(false);
        return;
      }

      const hasCollision = collidingShifts.length > 0;

      const { error } = await supabase.from('swap_requests').insert({
        shift_id: shift.id,
        requester_id: currentUser.id,
        target_user_id: selectedUser.id,
        request_type: 'transfer',
        message: message.trim() || null,
        status: 'pending',
      });

      if (error) throw error;

      // Notification to target user (push + in-app)
      const collisionNote = hasCollision ? ' ⚠️ (มีเวรซ้อนในช่วงเวลาเดียวกัน)' : '';
      const requesterName = currentUser.f_name || currentUser.nickname || 'เพื่อนร่วมงาน';
      const notifTitle = '📩 มีคำขอโอนเวรให้คุณ';
      const notifBody = `${requesterName} ต้องการโอนเวรให้คุณ${collisionNote}`;

      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          title: notifTitle,
          body: notifBody,
          url: '/calendar',
          tag: 'transfer-new',
        }),
      }).catch(() => {});

      supabase.from('notifications').insert({
        user_id: selectedUser.id,
        type: 'swap_request',
        title: notifTitle,
        body: notifBody,
        url: '/calendar',
      }).then(({ error: nErr }) => { if (nErr) console.error('[Transfer] in-app notif error:', nErr); });

      toast.success('ส่งคำขอโอนเวรเรียบร้อยแล้ว');
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      toast.error('เกิดข้อผิดพลาด', { description: err.message });
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmCollision() {
    setCollisionConfirmed(true);
    setCollisionWarning(null);
    setTimeout(() => handleSubmit(), 50);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slide-up sm:animate-fade-in max-h-[90vh] flex flex-col">
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-100">
              <ArrowRightLeft className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="font-semibold text-gray-900">โอนเวร</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Not-published lock banner */}
          {!isMonthPublished && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <Lock className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                ตารางเวรเดือนนี้ยังไม่ได้ประกาศ<br />
                <span className="font-normal text-red-600">ไม่สามารถโอนเวรได้จนกว่าจะมีการประกาศตารางเวร</span>
              </p>
            </div>
          )}

          {/* Mode Badge */}
          <div className="p-3 rounded-xl border text-center text-sm font-medium bg-violet-50 border-violet-200 text-violet-700">
            📌 คุณกำลังโอนเวรนี้ให้ผู้อื่น
          </div>

          {/* Shift Info */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">เวรของคุณ</h3>
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
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  DEPT_STYLES[deptName]?.text || 'text-gray-600'
                )}>
                  {displayDeptName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-700">{ownerLabel}</span>
              </div>
            </div>
          </div>

          {/* Select target user */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              เลือก{roleName}ที่ต้องการให้มาอยู่แทน
            </h3>
            {fetchingUsers ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อ..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {users
                    .filter((u) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.trim().toLowerCase();
                      return (
                        (u.nickname || '').toLowerCase().includes(q) ||
                        (u.f_name || '').toLowerCase().includes(q)
                      );
                    })
                    .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUser(u.id === selectedUser?.id ? null : u)}
                      className={cn(
                        'p-2 rounded-lg border text-left transition-all duration-150',
                        selectedUser?.id === u.id
                          ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {u.nickname || u.f_name}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Collision Warning */}
          {collisionWarning && (
            <div className="p-3 rounded-xl bg-amber-50 border-2 border-amber-400 animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-amber-800">{collisionWarning}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setCollisionWarning(null); setCollisionConfirmed(false); }}
                      className="flex-1 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-all"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleConfirmCollision}
                      className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all"
                    >
                      ยืนยันส่งคำขอ
                    </button>
                  </div>
                </div>
              </div>
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
            className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 hover:text-red-600 text-sm font-medium hover:bg-red-50 transition-all"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedUser || !!collisionWarning || !isMonthPublished}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
              !isMonthPublished
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/20"
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : !isMonthPublished ? <Lock className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
            {!isMonthPublished ? 'ยังไม่ได้ประกาศตารางเวร' : 'ส่งคำขอโอนเวร'}
          </button>
        </div>
      </div>
    </div>
  );
}
