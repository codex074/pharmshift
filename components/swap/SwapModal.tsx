'use client';

import { useState, useEffect } from 'react';
import {
  X, ArrowRightLeft, User, Calendar, Building2, Moon, Sun,
  Loader2, Search, AlertTriangle, Lock, UserCheck, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Shift, ShiftType, User as UserType, UserRole } from '@/lib/types';
import { DEPT_STYLES, ROLE_LABELS } from '@/lib/types';
import { cn, shiftsOverlap } from '@/lib/utils';
import { postAuditLog } from '@/lib/auditLogClient';
import { insertNotifications } from '@/lib/notifyUsers';
import {
  format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameMonth,
} from 'date-fns';
import { th } from 'date-fns/locale';

const THAI_DAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DUPLICATE_TARGET_SHIFT_ID = '00000000-0000-0000-0000-000000000000';

function getShiftPillStyle(shiftType: string): string {
  if (shiftType === 'เช้า')     return 'bg-[#E8F9FA] border-[#9FDCE0] text-teal-900';
  if (shiftType === 'บ่าย')     return 'bg-[#F3EDF8] border-[#9E76B4] text-purple-900';
  if (shiftType === 'ดึก')      return 'bg-[#EEF0FF] border-[#99ABFF] text-indigo-900';
  if (shiftType === 'รุ่งอรุณ') return 'bg-[#FEF3DC] border-[#FFCA72] text-amber-900';
  return 'bg-violet-100 border-violet-300 text-violet-800';
}

function getShiftLabel(shiftType: string, deptName: string, position?: string): string {
  if (shiftType === 'เช้า' && deptName === 'MED' && position) return `MED ${position}`;
  if (shiftType === 'เช้า' && deptName === 'SURG') return 'SURG';
  if (deptName === 'Chemo') return 'Chemo';
  if (shiftType === 'บ่าย' && deptName === 'SMC') return 'SMC';
  if (shiftType === 'ดึก') return 'ดึก';
  if (shiftType === 'รุ่งอรุณ') return position ? `รุ่ง${position}` : 'รุ่ง';
  if (deptName === 'โครงการ') return 'Ext';
  if (deptName === 'Chemo') return 'Chem';
  if (deptName) return deptName;
  return shiftType;
}

async function hasPendingDuplicateRequest(params: {
  shiftId: string;
  requesterId: string;
  targetUserId: string;
  requestType: 'swap' | 'transfer' | 'cover';
  targetShiftId?: string | null;
}) {
  let query = supabase
    .from('swap_requests')
    .select('id', { head: true, count: 'exact' })
    .eq('shift_id', params.shiftId)
    .eq('requester_id', params.requesterId)
    .eq('target_user_id', params.targetUserId)
    .eq('request_type', params.requestType)
    .eq('status', 'pending');

  if (params.requestType === 'swap') {
    query = query.eq('target_shift_id', params.targetShiftId || DUPLICATE_TARGET_SHIFT_ID);
  } else {
    query = query.is('target_shift_id', null);
  }

  const { count, error } = await query;
  if (error) throw error;
  return (count || 0) > 0;
}

function normalizeSubmitError(err: any): string {
  const raw = err?.message || 'เกิดข้อผิดพลาด';
  if (typeof raw === 'string' && (raw.includes('duplicate') || raw.includes('swap_requests_uniq_pending_request_idx'))) {
    return 'มีคำขอค้างอยู่แล้วสำหรับเวรนี้';
  }
  return raw;
}

function duplicateRequestMessage(name: string | undefined) {
  return `ส่งคำขอถึง ${name || 'ผู้ใช้รายนี้'} ไปแล้วก่อนหน้านี้`;
}

function formatAuditShift(shift: Shift | null | undefined) {
  if (!shift) return 'เวร';
  const deptName = (shift.department as { name?: string } | undefined)?.name || '';
  const area = [deptName, shift.position].filter(Boolean).join(' ');
  const dateLabel = format(new Date(`${shift.date}T00:00:00`), 'd MMM yyyy', { locale: th });
  return `เวร${shift.shift_type}${area ? ` ${area}` : ''} วันที่ ${dateLabel}`;
}

interface SwapModalProps {
  shift: Shift | null;
  currentUser: UserType | null;
  publishedRoles: Record<string, boolean>;
  /** All shifts for the current user this month — used for swap-mode mini calendar */
  userShifts: Shift[];
  onClose: () => void;
}

export function SwapModal({
  shift, currentUser, publishedRoles, userShifts, onClose,
}: SwapModalProps) {
  // ── Shared ──────────────────────────────────────────────────────────
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [collisionWarning, setCollisionWarning] = useState<string | null>(null);
  const [collisionConfirmed, setCollisionConfirmed] = useState(false);

  // ── Transfer mode ────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserType[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fetchingUsers, setFetchingUsers] = useState(false);

  // ── Swap mode ────────────────────────────────────────────────────────
  const [swapAction, setSwapAction] = useState<null | 'cover' | 'swap'>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMyShift, setSelectedMyShift] = useState<Shift | null>(null);
  const [calViewDate, setCalViewDate] = useState<Date>(() => startOfMonth(shift ? new Date(shift.date + 'T00:00:00') : new Date()));
  const [calViewShifts, setCalViewShifts] = useState<Shift[]>(userShifts);
  const [fetchingCalShifts, setFetchingCalShifts] = useState(false);
  const [calMonthPublished, setCalMonthPublished] = useState<boolean>(true);

  // ── Derived ──────────────────────────────────────────────────────────
  const isOwnShift = !!(currentUser && shift && currentUser.id === shift.user_id);
  const mode = isOwnShift ? 'transfer' : 'swap';

  const ownerRoleForPublish: UserRole =
    ((shift?.user as any)?.role || currentUser?.role || 'pharmacist') as UserRole;
  const isMonthPublished = !!publishedRoles[ownerRoleForPublish];

  const shiftOwner = shift?.user as { f_name: string; nickname?: string; role?: UserRole } | undefined;
  const ownerLabel = shiftOwner?.f_name || shiftOwner?.nickname || '—';
  const ownerRole: UserRole = shiftOwner?.role || currentUser?.role || 'pharmacist';
  const roleName = ROLE_LABELS[ownerRole] || 'เภสัชกร';
  const shiftDate = shift ? new Date(shift.date + 'T00:00:00') : new Date();
  const deptName = (shift?.department as { name: string })?.name || '';
  const displayDeptName = shift?.position
    ? `${deptName} ${shift.position === 'D/C' ? 'D/D' : shift.position}`
    : deptName;

  // ── Fetch users for transfer mode ────────────────────────────────────
  useEffect(() => {
    if (!shift || mode !== 'transfer') return;
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
        if (!error) setUsers((data as UserType[]) || []);
        setFetchingUsers(false);
      });
  }, [shift, ownerRole, mode]);

  // Reset errors when selection changes
  useEffect(() => {
    setSubmitError(null);
    setCollisionWarning(null);
    setCollisionConfirmed(false);
  }, [selectedUser, selectedMyShift]);

  // Fetch user shifts when calendar month changes (only if month is published)
  useEffect(() => {
    if (!currentUser || swapAction !== 'swap') return;
    const monthYear = format(calViewDate, 'yyyy-MM');
    const roleCol =
      currentUser.role === 'pharmacist'          ? 'pharmacist_published' :
      currentUser.role === 'pharmacy_technician' ? 'pharmacy_technician_published' :
      currentUser.role === 'officer'             ? 'officer_published' : null;

    setFetchingCalShifts(true);
    setCalViewShifts([]);

    supabase
      .from('published_months')
      .select(roleCol ? `${roleCol}` : 'is_published')
      .eq('month_year', monthYear)
      .maybeSingle()
      .then(async ({ data }) => {
        const published = roleCol
          ? !!(data as any)?.[roleCol]
          : !!(data as any)?.is_published;

        setCalMonthPublished(published);
        if (!published) { setFetchingCalShifts(false); return; }

        const from = format(startOfMonth(calViewDate), 'yyyy-MM-dd');
        const to   = format(endOfMonth(calViewDate),   'yyyy-MM-dd');
        const { data: shifts } = await supabase
          .from('shifts')
          .select('*, department:departments(name)')
          .eq('user_id', currentUser.id)
          .gte('date', from)
          .lte('date', to);
        setCalViewShifts((shifts as Shift[]) || []);
        setFetchingCalShifts(false);
      });
  }, [calViewDate, swapAction, currentUser]);

  if (!shift || !currentUser) return null;

  // ── Mini calendar data for swap mode ─────────────────────────────────
  const calMonthStart = startOfMonth(calViewDate);
  const calMonthEnd   = endOfMonth(calViewDate);
  const calStart      = startOfWeek(calMonthStart, { weekStartsOn: 0 });

  const calDays: Date[] = [];
  let cur = calStart;
  while (cur <= calMonthEnd || calDays.length % 7 !== 0) {
    calDays.push(new Date(cur));
    cur = addDays(cur, 1);
    if (calDays.length >= 42) break;
  }

  const myShiftsByDate: Record<string, Shift[]> = {};
  calViewShifts.forEach(s => {
    if (!myShiftsByDate[s.date]) myShiftsByDate[s.date] = [];
    myShiftsByDate[s.date].push(s);
  });

  const myShiftsOnSelectedDate = selectedDate ? (myShiftsByDate[selectedDate] || []) : [];

  // ── Handlers ─────────────────────────────────────────────────────────
  async function handleTransferSubmit() {
    if (!currentUser || !shift) return;
    if (!isMonthPublished) { setSubmitError('ตารางเวรเดือนนี้ยังไม่ได้ประกาศ'); return; }
    if (!selectedUser) { setSubmitError(`กรุณาเลือก${roleName}ที่ต้องการให้มาอยู่แทน`); return; }
    setLoading(true);
    setSubmitError(null);
    try {
      const { data: targetShifts } = await supabase
        .from('shifts').select('id, shift_type')
        .eq('user_id', selectedUser.id).eq('date', shift.date);
      const colliding = (targetShifts || []).filter(s =>
        shiftsOverlap(s.shift_type as ShiftType, shift.shift_type as ShiftType));
      if (colliding.length > 0 && !collisionConfirmed) {
        setCollisionWarning(
          `${selectedUser.f_name || selectedUser.nickname} มีเวรในช่วงเวลาเดียวกันอยู่แล้ว คุณต้องการส่งคำขอต่อหรือไม่?`);
        setLoading(false); return;
      }
      const hasDuplicate = await hasPendingDuplicateRequest({
        shiftId: shift.id,
        requesterId: currentUser.id,
        targetUserId: selectedUser.id,
        requestType: 'transfer',
      });
      if (hasDuplicate) {
        const duplicateMessage = duplicateRequestMessage(selectedUser.f_name || selectedUser.nickname);
        setSubmitError(duplicateMessage);
        toast.warning('มีคำขอค้างอยู่แล้ว', { description: duplicateMessage });
        setLoading(false); return;
      }
      const { error } = await supabase.from('swap_requests').insert({
        shift_id: shift.id, requester_id: currentUser.id,
        target_user_id: selectedUser.id, request_type: 'transfer',
        message: message.trim() || null, status: 'pending',
      });
      if (error) throw error;
      await postAuditLog({
        action: 'request_transfer',
        description: `ขอโอน${formatAuditShift(shift)} ให้ ${selectedUser.f_name || selectedUser.nickname || 'ผู้ใช้'}`,
      });
      const requesterName = currentUser.nickname || currentUser.f_name || 'เพื่อนร่วมงาน';
      const shiftDateFmt = format(shiftDate, 'd MMM', { locale: th });
      const notifTitle = '📩 คำขอโอนเวร';
      const notifBody = `${requesterName} ขอให้คุณรับ เวร${shift.shift_type} ${shiftDateFmt}${deptName ? ` (${deptName})` : ''}${colliding.length > 0 ? ' ⚠️ มีเวรซ้อน' : ''}`;
      fetch('/api/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, title: notifTitle, body: notifBody, url: '/calendar', tag: 'transfer-new' }),
      }).catch(() => {});
      insertNotifications([selectedUser.id], 'swap_request', notifTitle, notifBody);
      toast.success('ส่งคำขอโอนเวรเรียบร้อยแล้ว');
      onClose();
    } catch (err: any) {
      const messageText = normalizeSubmitError(err);
      setSubmitError(messageText);
      toast.error(messageText === 'มีคำขอค้างอยู่แล้วสำหรับเวรนี้' ? 'ส่งคำขอซ้ำไม่ได้' : 'เกิดข้อผิดพลาด', { description: messageText });
    } finally { setLoading(false); }
  }

  async function handleSwapSubmit() {
    if (!currentUser || !shift || !selectedMyShift) return;
    if (!isMonthPublished) { setSubmitError('ตารางเวรเดือนนี้ยังไม่ได้ประกาศ'); return; }
    setLoading(true);
    setSubmitError(null);
    try {
      // Check collisions on both sides
      const [{ data: targetShiftsOnMyDate }, { data: myShiftsOnTargetDate }] = await Promise.all([
        supabase.from('shifts').select('id, shift_type').eq('user_id', shift.user_id).eq('date', selectedMyShift.date),
        supabase.from('shifts').select('id, shift_type').eq('user_id', currentUser.id).eq('date', shift.date),
      ]);
      const collidingForTarget = (targetShiftsOnMyDate || []).filter(s =>
        s.id !== shift.id && shiftsOverlap(s.shift_type as ShiftType, selectedMyShift.shift_type as ShiftType));
      const collidingForMe = (myShiftsOnTargetDate || []).filter(s =>
        s.id !== selectedMyShift.id && shiftsOverlap(s.shift_type as ShiftType, shift.shift_type as ShiftType));
      if ((collidingForTarget.length > 0 || collidingForMe.length > 0) && !collisionConfirmed) {
        const msgs: string[] = [];
        if (collidingForMe.length > 0) msgs.push('คุณมีเวรซ้อนในวันที่ต้องการรับ');
        if (collidingForTarget.length > 0) msgs.push('อีกฝ่ายมีเวรซ้อนในวันของคุณ');
        setCollisionWarning(msgs.join(' และ ') + ' คุณต้องการส่งคำขอต่อหรือไม่?');
        setLoading(false); return;
      }
      const hasDuplicate = await hasPendingDuplicateRequest({
        shiftId: shift.id,
        requesterId: currentUser.id,
        targetUserId: shift.user_id,
        requestType: 'swap',
        targetShiftId: selectedMyShift.id,
      });
      if (hasDuplicate) {
        const duplicateMessage = duplicateRequestMessage(ownerLabel);
        setSubmitError(duplicateMessage);
        toast.warning('มีคำขอค้างอยู่แล้ว', { description: duplicateMessage });
        setLoading(false); return;
      }
      const { error } = await supabase.from('swap_requests').insert({
        shift_id: shift.id,                    // target's shift (what requester wants)
        target_shift_id: selectedMyShift.id,   // requester's shift (offered in exchange)
        requester_id: currentUser.id,
        target_user_id: shift.user_id,
        request_type: 'swap',
        message: message.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      await postAuditLog({
        action: 'request_swap',
        description: `ขอแลก${formatAuditShift(selectedMyShift)} กับ ${ownerLabel} (${formatAuditShift(shift)})`,
      });
      const requesterName = currentUser.nickname || currentUser.f_name || 'เพื่อนร่วมงาน';
      const myDateFmt    = format(new Date(selectedMyShift.date + 'T00:00:00'), 'd MMM', { locale: th });
      const yourDateFmt  = format(shiftDate, 'd MMM', { locale: th });
      const myDept       = (selectedMyShift.department as any)?.name || '';
      const notifTitle = '🔄 คำขอแลกเวร';
      const notifBody  = `${requesterName} เสนอแลก เวร${selectedMyShift.shift_type} ${myDateFmt}${myDept ? ` (${myDept})` : ''} ของเขา กับ เวร${shift.shift_type} ${yourDateFmt}${deptName ? ` (${deptName})` : ''} ของคุณ`;
      fetch('/api/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: shift.user_id, title: notifTitle, body: notifBody, url: '/calendar', tag: 'swap-new' }),
      }).catch(() => {});
      insertNotifications([shift.user_id], 'swap_request', notifTitle, notifBody);
      toast.success('ส่งคำขอแลกเวรเรียบร้อยแล้ว');
      onClose();
    } catch (err: any) {
      const messageText = normalizeSubmitError(err);
      setSubmitError(messageText);
      toast.error(messageText === 'มีคำขอค้างอยู่แล้วสำหรับเวรนี้' ? 'ส่งคำขอซ้ำไม่ได้' : 'เกิดข้อผิดพลาด', { description: messageText });
    } finally { setLoading(false); }
  }

  async function handleCoverSubmit() {
    if (!currentUser || !shift) return;
    if (!isMonthPublished) { setSubmitError('ตารางเวรเดือนนี้ยังไม่ได้ประกาศ'); return; }
    setLoading(true);
    setSubmitError(null);
    try {
      const { data: myShiftsOnDate } = await supabase
        .from('shifts').select('id, shift_type')
        .eq('user_id', currentUser.id).eq('date', shift.date);
      const colliding = (myShiftsOnDate || []).filter(s =>
        shiftsOverlap(s.shift_type as ShiftType, shift.shift_type as ShiftType));
      if (colliding.length > 0 && !collisionConfirmed) {
        setCollisionWarning('คุณมีเวรในช่วงเวลาเดียวกันอยู่แล้ว คุณต้องการส่งคำขอต่อหรือไม่?');
        setLoading(false); return;
      }
      const hasDuplicate = await hasPendingDuplicateRequest({
        shiftId: shift.id,
        requesterId: currentUser.id,
        targetUserId: shift.user_id,
        requestType: 'cover',
      });
      if (hasDuplicate) {
        const duplicateMessage = duplicateRequestMessage(ownerLabel);
        setSubmitError(duplicateMessage);
        toast.warning('มีคำขอค้างอยู่แล้ว', { description: duplicateMessage });
        setLoading(false); return;
      }
      const { error } = await supabase.from('swap_requests').insert({
        shift_id: shift.id,
        requester_id: currentUser.id,
        target_user_id: shift.user_id,
        request_type: 'cover',
        message: message.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      await postAuditLog({
        action: 'request_cover',
        description: `ขออยู่แทน ${ownerLabel} ใน${formatAuditShift(shift)}`,
      });
      const requesterName = currentUser.nickname || currentUser.f_name || 'เพื่อนร่วมงาน';
      const shiftDateFmt = format(shiftDate, 'd/M', { locale: th });
      const notifTitle = '🙋 คำขออยู่เวรแทน';
      const notifBody = `${requesterName} ต้องการขออยู่เวร${shift.shift_type}${deptName ? ` ${deptName}` : ''} ${shiftDateFmt} แทนคุณ`;
      fetch('/api/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: shift.user_id, title: notifTitle, body: notifBody, url: '/calendar', tag: 'cover-new' }),
      }).catch(() => {});
      insertNotifications([shift.user_id], 'swap_request', notifTitle, notifBody);
      toast.success('ส่งคำขออยู่เวรแทนเรียบร้อยแล้ว');
      onClose();
    } catch (err: any) {
      const messageText = normalizeSubmitError(err);
      setSubmitError(messageText);
      toast.error(messageText === 'มีคำขอค้างอยู่แล้วสำหรับเวรนี้' ? 'ส่งคำขอซ้ำไม่ได้' : 'เกิดข้อผิดพลาด', { description: messageText });
    } finally { setLoading(false); }
  }

  function handleConfirmCollision() {
    setCollisionConfirmed(true);
    setCollisionWarning(null);
    setTimeout(() => {
      if (swapAction === 'cover') handleCoverSubmit();
      else if (mode === 'transfer') handleTransferSubmit();
      else handleSwapSubmit();
    }, 50);
  }

  // ── Shift info card (shared) ─────────────────────────────────────────
  const shiftInfoCard = (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {mode === 'transfer' ? 'เวรของคุณ' : `เวรของ ${ownerLabel}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-700">{format(shiftDate, 'd MMM yyyy', { locale: th })}</span>
        </div>
        <div className="flex items-center gap-2">
          {shift.shift_type === 'ดึก'
            ? <Moon className="w-3.5 h-3.5 text-violet-500" />
            : <Sun className="w-3.5 h-3.5 text-amber-500" />}
          <span className="text-sm text-gray-700">{shift.shift_type}</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-gray-400" />
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
            DEPT_STYLES[deptName]?.text || 'text-gray-600')}>
            {displayDeptName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-700">{ownerLabel}</span>
        </div>
      </div>
    </div>
  );

  const isTransferReady = mode === 'transfer' && !!selectedUser;
  const isSwapReady = swapAction === 'swap' && !!selectedMyShift;
  const canSubmit = (isTransferReady || isSwapReady) && !collisionWarning && isMonthPublished;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-3xl animate-slide-up sm:animate-fade-in max-h-[92vh] flex flex-col">
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
              mode === 'transfer' ? 'bg-violet-100' : 'bg-blue-100')}>
              <ArrowRightLeft className={cn('w-4 h-4',
                mode === 'transfer' ? 'text-violet-600' : 'text-blue-600')} />
            </div>
            <h2 className="font-semibold text-gray-900">ส่งคำขอ</h2>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Not-published banner */}
          {!isMonthPublished && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <Lock className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                ตารางเวรเดือนนี้ยังไม่ได้ประกาศ<br />
                <span className="font-normal text-red-600">
                  ไม่สามารถ{mode === 'transfer' ? 'โอน' : 'แลก'}เวรได้จนกว่าจะประกาศตารางเวร
                </span>
              </p>
            </div>
          )}

          {/* Mode badge — transfer only */}
          {mode === 'transfer' && (
            <div className="p-3 rounded-xl border text-center text-sm font-medium bg-violet-50 border-violet-200 text-violet-700">
              📌 คุณกำลังโอนเวรนี้ให้ผู้อื่น
            </div>
          )}

          {shiftInfoCard}

          {/* ── TRANSFER MODE: recipient selector ──────────────────── */}
          {mode === 'transfer' && (
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
                      type="text" value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาชื่อ..."
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {users.filter(u => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.trim().toLowerCase();
                      return (u.nickname || '').toLowerCase().includes(q)
                        || (u.f_name || '').toLowerCase().includes(q);
                    }).map(u => (
                      <button key={u.id}
                        onClick={() => setSelectedUser(u.id === selectedUser?.id ? null : u)}
                        className={cn('p-2 rounded-lg border text-left transition-all duration-150',
                          selectedUser?.id === u.id
                            ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50')}>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {u.nickname || u.f_name}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SWAP MODE: Step 1 — choose action ──────────────────── */}
          {mode === 'swap' && swapAction === null && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSwapAction('cover')}
                disabled={!isMonthPublished}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400',
                )}>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-emerald-700">อยู่เวรแทน</p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">ขอรับเวรนี้</p>
                </div>
              </button>
              <button
                onClick={() => setSwapAction('swap')}
                disabled={!isMonthPublished}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400',
                )}>
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-blue-700">แลกเวร</p>
                  <p className="text-[10px] text-blue-500 mt-0.5">เสนอเวรของคุณ</p>
                </div>
              </button>
            </div>
          )}

          {/* ── SWAP MODE: Step 2a — cover confirmation ─────────────── */}
          {mode === 'swap' && swapAction === 'cover' && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              🙋 คุณต้องการขออยู่เวร{shift.shift_type}{deptName ? ` ${deptName}` : ''} วันที่{' '}
              <strong>{format(shiftDate, 'd/M', { locale: th })}</strong> แทน {ownerLabel}
            </div>
          )}

          {/* ── SWAP MODE: Step 2b — mini calendar + shift picker ───── */}
          {mode === 'swap' && swapAction === 'swap' && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                เลือกเวรของคุณที่ต้องการนำมาแลก
              </h3>

              {/* Mini calendar */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      const prev = new Date(calViewDate.getFullYear(), calViewDate.getMonth() - 1, 1);
                      setCalViewDate(prev);
                      setSelectedDate(null);
                      setSelectedMyShift(null);
                    }}
                    className="p-1 rounded-lg hover:bg-blue-100 text-blue-500 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm sm:text-base lg:text-lg font-semibold text-blue-700">
                    {fetchingCalShifts
                      ? <Loader2 className="w-4 h-4 animate-spin inline" />
                      : format(calViewDate, 'MMMM yyyy', { locale: th })}
                  </span>
                  <button
                    onClick={() => {
                      const next = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 1);
                      setCalViewDate(next);
                      setSelectedDate(null);
                      setSelectedMyShift(null);
                    }}
                    className="p-1 rounded-lg hover:bg-blue-100 text-blue-500 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {THAI_DAY_SHORT.map(d => (
                    <div key={d} className="text-center text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-400 py-1 sm:py-1.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calDays.map((day, i) => {
                    const inMonth = isSameMonth(day, calViewDate);
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayShifts = inMonth ? (myShiftsByDate[dateStr] || []) : [];
                    const hasMyShift = dayShifts.length > 0;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={i}
                        disabled={!hasMyShift}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedDate(null);
                            setSelectedMyShift(null);
                          } else {
                            setSelectedDate(dateStr);
                            setSelectedMyShift(dayShifts.length === 1 ? dayShifts[0] : null);
                          }
                        }}
                        className={cn(
                          'flex flex-col items-center gap-0.5 py-1 px-0.5 min-h-[3.5rem] sm:min-h-[4rem] lg:min-h-[4.75rem] sm:py-1.5 sm:px-1 transition-all',
                          hasMyShift ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default',
                          isSelected && 'bg-blue-100 rounded-lg',
                          !inMonth && 'opacity-0 pointer-events-none',
                        )}>
                        <span className={cn('text-xs sm:text-sm lg:text-base font-medium leading-none',
                          !inMonth ? 'text-gray-300' :
                          isSelected ? 'text-blue-700 font-bold' :
                          hasMyShift ? 'text-blue-600 font-semibold' : 'text-gray-400')}>
                          {format(day, 'd')}
                        </span>
                        {dayShifts.map((s, si) => {
                          const dept = (s.department as any)?.name || '';
                          const pos = (s as any).position;
                          return (
                            <span key={si} className={cn(
                              'text-[8px] sm:text-[10px] lg:text-xs font-semibold px-0.5 py-px sm:py-0.5 rounded border leading-tight w-full text-center truncate',
                              getShiftPillStyle(s.shift_type),
                            )}>
                              {getShiftLabel(s.shift_type, dept, pos)}
                            </span>
                          );
                        })}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!calMonthPublished ? (
                <p className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">
                  ตารางเวรเดือนนี้ยังไม่ได้ประกาศ
                </p>
              ) : !selectedDate && (
                <p className="text-xs text-center text-gray-400">
                  กดที่วันที่มีเวร • เพื่อเลือกเวรที่ต้องการแลก
                </p>
              )}

              {selectedDate && myShiftsOnSelectedDate.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500 font-medium">
                    เลือกเวรวันที่ {format(new Date(selectedDate + 'T00:00:00'), 'd MMMM', { locale: th })}:
                  </p>
                  {myShiftsOnSelectedDate.map(s => {
                    const sDept = (s.department as any)?.name || '';
                    const isSel = selectedMyShift?.id === s.id;
                    return (
                      <button key={s.id}
                        onClick={() => setSelectedMyShift(isSel ? null : s)}
                        className={cn(
                          'w-full flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all',
                          isSel
                            ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50',
                        )}>
                        {s.shift_type === 'ดึก'
                          ? <Moon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                          : <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="text-sm font-medium text-gray-800">{s.shift_type}</span>
                        {sDept && <span className="text-xs text-gray-400">{sDept}</span>}
                        {s.position && <span className="text-xs text-gray-400">({s.position})</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedMyShift && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold text-blue-700">สรุปการแลกเวร:</p>
                  <p>คุณจะได้รับ:{' '}
                    <strong>{shift.shift_type}{deptName ? ` ${deptName}` : ''} {format(shiftDate, 'd/M')}</strong>
                  </p>
                  <p>{ownerLabel} จะได้รับ:{' '}
                    <strong>
                      {selectedMyShift.shift_type}{(selectedMyShift.department as any)?.name ? ` ${(selectedMyShift.department as any).name}` : ''}{' '}
                      {format(new Date(selectedMyShift.date + 'T00:00:00'), 'd/M')}
                    </strong>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Collision warning */}
          {collisionWarning && (
            <div className="p-3 rounded-xl bg-amber-50 border-2 border-amber-400 animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-amber-800">{collisionWarning}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setCollisionWarning(null); setCollisionConfirmed(false); }}
                      className="flex-1 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-all">
                      ยกเลิก
                    </button>
                    <button onClick={handleConfirmCollision}
                      className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all">
                      ยืนยันส่งคำขอ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {submitError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-5 border-t border-gray-100 shrink-0">
          {/* Left: back / cancel */}
          {mode === 'swap' && swapAction !== null ? (
            <button
              onClick={() => { setSwapAction(null); setSelectedDate(null); setSelectedMyShift(null); setSubmitError(null); setCollisionWarning(null); }}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-50">
              ← ย้อนกลับ
            </button>
          ) : (
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 hover:text-red-600 text-sm font-medium hover:bg-red-50 transition-all">
              ยกเลิก
            </button>
          )}

          {/* Right: main action */}
          {(mode === 'transfer' || swapAction === 'cover' || swapAction === 'swap') && (
            <button
              onClick={
                swapAction === 'cover' ? handleCoverSubmit :
                mode === 'transfer' ? handleTransferSubmit : handleSwapSubmit
              }
              disabled={loading || (swapAction === 'cover' ? (!isMonthPublished) : !canSubmit)}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
                !isMonthPublished
                  ? 'bg-gray-400 cursor-not-allowed'
                  : swapAction === 'cover'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/20'
                    : mode === 'transfer'
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/20'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-blue-500/20',
              )}>
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : !isMonthPublished
                  ? <Lock className="w-4 h-4" />
                  : swapAction === 'cover'
                    ? <UserCheck className="w-4 h-4" />
                    : <ArrowRightLeft className="w-4 h-4" />}
              {!isMonthPublished
                ? 'ยังไม่ได้ประกาศตารางเวร'
                : swapAction === 'cover'
                  ? 'ส่งคำขออยู่เวรแทน'
                  : mode === 'transfer'
                    ? 'ส่งคำขอโอนเวร'
                    : 'ส่งคำขอแลกเวร'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
