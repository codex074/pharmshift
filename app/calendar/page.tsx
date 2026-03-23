'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toastSuccess, toastError } from '@/lib/swal';
import { useShifts, useSwapRequests, useCurrentUser, useNotifications } from '@/hooks/useShifts';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { MyCalendarGrid } from '@/components/calendar/MyCalendarGrid';
import { PharmacyTechCalendarGrid } from '@/components/calendar/PharmacyTechCalendarGrid';
import { OfficeCalendarGrid } from '@/components/calendar/OfficeCalendarGrid';
import { MobileCalendarGrid } from '@/components/calendar/MobileCalendarGrid';
import { DayDetailModal } from '@/components/calendar/DayDetailModal';
import { SwapModal } from '@/components/swap/SwapModal';
import { NotificationsPanel } from '@/components/swap/NotificationsPanel';
import { AdminConfirmModal } from '@/components/calendar/AdminConfirmModal';
import { AdminShiftSubstituteModal } from '@/components/calendar/AdminShiftSubstituteModal';
import { AdminAddShiftModal } from '@/components/calendar/AdminAddShiftModal';
import type { PendingAdd, AddShiftContext } from '@/components/calendar/AdminAddShiftModal';
import { LoadingOverlay } from '@/components/ui/loading-overlay';

import { AdminExportModal } from '@/components/calendar/AdminExportModal';
import { ScheduleTableExportButton } from '@/components/calendar/ScheduleTableExportButton';
import { ShiftUploadModal } from '@/components/calendar/ShiftUploadModal';
import { PersonalShiftsModal } from '@/components/calendar/PersonalShiftsModal';
import { CompensationModal } from '@/components/calendar/CompensationModal';
import { DeployModal } from '@/components/calendar/DeployModal';
import { AdminSettingsModal } from '@/components/calendar/AdminSettingsModal';
import { Header } from '@/components/layout/Header';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { MobileAdminMenu } from '@/components/layout/MobileAdminMenu';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import type { Shift, CalendarDay, UserRole, User, ShiftType } from '@/lib/types';
import { SHIFT_CONFIG, DEPT_COLORS, ROLE_LABELS, STAFF_ROLES, isAdmin, isAdminLike } from '@/lib/types';
import { formatThaiMonth } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null); // kept for MyCalendarGrid only
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showPersonalShiftsModal, setShowPersonalShiftsModal] = useState(false);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [showAdminExportModal, setShowAdminExportModal] = useState(false);
  const [personalShiftsFilter, setPersonalShiftsFilter] = useState<ShiftType | 'all'>('all');
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');
  const [viewRoleGroup, setViewRoleGroup] = useState<UserRole>('pharmacist');
  
  // Admin Edit Mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [pendingEdits, setPendingEdits] = useState<Record<string, User>>({});
  const [editingSubsShift, setEditingSubsShift] = useState<Shift | null>(null);
  const [showAdminConfirm, setShowAdminConfirm] = useState(false);
  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
  const [addingShiftContext, setAddingShiftContext] = useState<AddShiftContext | null>(null);

  const isMobile = useIsMobile();
  const [mobileDaySelected, setMobileDaySelected] = useState<CalendarDay | null>(null);

  const { user: currentUser, loading: authLoading } = useCurrentUser();
  const { shifts: allShifts, holidays, isPublished, publishedRoles, loading: shiftsLoading, refetch } = useShifts(year, month);
  const { notifications, unreadCount: notifUnreadCount, markAllRead: markNotifsRead } = useNotifications(currentUser?.id);

  // Auto-subscribe to push notifications when user is authenticated
  useEffect(() => {
    if (!currentUser?.id || authLoading) return;
    import('@/lib/pushNotifications').then(({ subscribeToPush, isPushSupported }) => {
      if (isPushSupported()) subscribeToPush(currentUser.id);
    });
  }, [currentUser?.id, authLoading]);

  const userIsAdmin = isAdmin(currentUser);
  const userIsAdminLike = isAdminLike(currentUser);

  // For admin/sub-admin: use viewRoleGroup selector; for staff: use own role
  const effectiveRoleGroup: UserRole =
    userIsAdminLike
      ? viewRoleGroup
      : (currentUser?.role as UserRole) ?? 'pharmacist';

  // Shifts for the active role group (used in "ทุกเวร" view)
  const shifts = allShifts.filter(s => (s.user as any)?.role === effectiveRoleGroup);
  const {
    swapRequests, pendingCount, acceptSwap, rejectSwap, cancelSwap, markRequesterRead,
  } = useSwapRequests(currentUser?.id);

  async function handleAcceptSwap(req: Parameters<typeof acceptSwap>[0], force = false) {
    const result = await acceptSwap(req, force);
    if (result?.collision) return result;
    refetch();
    return result;
  }



  function handleMonthChange(y: number, m: number) {
    setYear(y);
    setMonth(m);
  }

  function handleDayClick(day: CalendarDay) {
    if (isMobile) setMobileDaySelected(day);
  }

  function handleMobileDayClick(day: CalendarDay) {
    setMobileDaySelected(day);
  }

  function handleShiftClick(shift: Shift) {
    if (isEditMode) return; // Don't open swap modal in edit mode
    if (currentUser?.is_active === false) {
      toastError('บัญชีของคุณถูกระงับ — ไม่สามารถแลก/ซื้อเวรได้');
      return;
    }
    setMobileDaySelected(null); // close day detail modal if open
    setSelectedShift(shift);
  }

  function handleToggleEditMode() {
    setIsEditMode(!isEditMode);
    setPendingDeletes(new Set());
    setPendingEdits({});
    setPendingAdds([]);
  }

  function handleToggleDelete(shiftId: string) {
    setPendingDeletes(prev => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  }

  function handleEditShiftFromCalendar(shift: Shift) {
    if (!isEditMode) return;
    setEditingSubsShift(shift);
  }

  function handleSelectSubstitute(user: User) {
    if (editingSubsShift) {
      setPendingEdits(prev => ({ ...prev, [editingSubsShift.id]: user }));
    }
    setEditingSubsShift(null);
  }

  function handleAddShift(ctx: AddShiftContext) {
    setAddingShiftContext(ctx);
  }

  function handleConfirmAdd(add: PendingAdd) {
    setPendingAdds(prev => [...prev, add]);
    setAddingShiftContext(null);
  }

  function handleRemovePendingAdd(index: number) {
    setPendingAdds(prev => prev.filter((_, i) => i !== index));
  }

  // Stats — if current user exists, only count their shifts, else count all shifts visible
  const myShifts  = allShifts.filter((s) => s.user_id === currentUser?.id);
  const sourceShiftsForStats = currentUser ? myShifts : shifts;
  const totalCount = sourceShiftsForStats.length;
  const chaoCount = sourceShiftsForStats.filter((s) => s.shift_type === 'เช้า').length;
  const baiCount  = sourceShiftsForStats.filter((s) => s.shift_type === 'บ่าย').length;
  const duekCount = sourceShiftsForStats.filter((s) => s.shift_type === 'ดึก').length;
  const rungCount = sourceShiftsForStats.filter((s) => s.shift_type === 'รุ่งอรุณ').length;

  const handleSwipeLeft = useCallback(() => {
    const d = new Date(year, month);
    handleMonthChange(d.getFullYear(), d.getMonth() + 1);
  }, [year, month]);

  const handleSwipeRight = useCallback(() => {
    const d = new Date(year, month - 2);
    handleMonthChange(d.getFullYear(), d.getMonth() + 1);
  }, [year, month]);

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  });


  if (authLoading) {
    return <LoadingOverlay variant="screen" />;
  }

  return (
    <>
      <Header
        currentUser={currentUser}
        pendingCount={pendingCount + notifUnreadCount}
        onBellClick={() => setShowNotifications(true)}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <main className={cn("w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5", isMobile && "pb-24")}>
        {/* Personal Shifts Modal */}
      <PersonalShiftsModal
        isOpen={showPersonalShiftsModal}
        onClose={() => setShowPersonalShiftsModal(false)}
        shifts={myShifts}
        filterType={personalShiftsFilter}
        month={month}
        year={year}
      />
      {/* Admin Export Modal */}
      {showAdminExportModal && (
        <AdminExportModal
          onClose={() => setShowAdminExportModal(false)}
          defaultMonth={month}
          defaultYear={year}
        />
      )}
      {/* Compensation Modal */}
      <CompensationModal
        isOpen={showCompensationModal}
        onClose={() => setShowCompensationModal(false)}
        shifts={myShifts}
        currentUser={currentUser}
        month={month}
        year={year}
      />
        {/* Page title + actions */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {viewMode === 'mine' ? 'เวรของฉัน' : `ตารางเวร${ROLE_LABELS[effectiveRoleGroup]}`}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{formatThaiMonth(year, month)}</p>
          </div>
        {/* Desktop action buttons (hidden on mobile — mobile uses FAB menu) */}
        <div className={cn("flex items-center gap-2 flex-wrap", isMobile && "hidden")}>
            {userIsAdminLike && (
              <>
                {isEditMode ? (
                  <>
                    <button
                      onClick={() => setShowAdminConfirm(true)}
                      className="bg-indigo-600 text-white hover:bg-indigo-700 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <span>✅</span>
                      <span>ยืนยันการแก้ไข</span>
                    </button>
                    <button
                      onClick={handleToggleEditMode}
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <span>❌</span>
                      <span>ยกเลิก</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleToggleEditMode}
                    className="bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <span>✏️</span>
                    <span className="sm:hidden">แก้ไข</span>
                    <span className="hidden sm:inline">โหมดแก้ไข</span>
                  </button>
                )}
                <button
                  onClick={() => setShowDeployModal(true)}
                  className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span>📢</span>
                  <span className="sm:hidden">ประกาศ</span>
                  <span className="hidden sm:inline">ประกาศตารางเวร</span>
                </button>
              </>
            )}
            {userIsAdminLike && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>📂</span>
                <span className="sm:hidden">CSV</span>
                <span className="hidden sm:inline">เพิ่มเวร</span>
              </button>
            )}
            {userIsAdmin && (
              <button
                onClick={() => setShowAdminSettings(true)}
                className="bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>⚙️</span>
                <span className="sm:hidden">ตั้งค่า</span>
                <span className="hidden sm:inline">ตั้งค่าระบบ</span>
              </button>
            )}
<ScheduleTableExportButton shifts={allShifts} holidays={holidays} year={year} month={month} />
            {currentUser && (
               <button
                 onClick={() => setShowCompensationModal(true)}
                 className="bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
               >
                 <span>💰</span>
                 <span className="sm:hidden">ค่าตอบแทน</span>
                 <span className="hidden sm:inline">ค่าตอบแทน</span>
               </button>
            )}
            {userIsAdminLike && (
              <button
                onClick={() => setShowAdminExportModal(true)}
                className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>📊</span>
                <span className="sm:hidden">Export</span>
                <span className="hidden sm:inline">Export Excel</span>
              </button>
            )}
          </div>

          {/* Mobile: compensation button for non-admin users */}
          {isMobile && currentUser && !userIsAdminLike && (
            <button
              onClick={() => setShowCompensationModal(true)}
              className="bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 font-medium px-3 py-2 rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5"
            >
              <span>💰</span>
              <span>ค่าตอบแทน</span>
            </button>
          )}
        </div>

        {/* Admin/Sub-admin: role group tab switcher */}
        {userIsAdminLike && (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            <div className="flex items-center gap-2 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200/50 shadow-sm w-max min-w-full sm:w-auto">
              {STAFF_ROLES.map((role) => {
                const isActive = viewRoleGroup === role;
                let activeClass = 'bg-gray-800 text-white shadow-md';
                if (role === 'pharmacist') activeClass = 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20';
                if (role === 'pharmacy_technician') activeClass = 'bg-violet-600 text-white shadow-md shadow-violet-600/20';
                if (role === 'officer') activeClass = 'bg-sky-500 text-white shadow-md shadow-sky-500/20';

                return (
                  <button
                    key={role}
                    onClick={() => setViewRoleGroup(role)}
                    className={cn(
                      'px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 whitespace-nowrap',
                      isActive
                        ? activeClass
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/60'
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!publishedRoles[effectiveRoleGroup] && userIsAdminLike && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm flex items-center gap-2">
            ⚠️ ตารางเวรตำแหน่งนี้ยังไม่ถูกประกาศให้ผู้ใช้ทั่วไปเห็น กรุณาตรวจสอบความถูกต้องและกด &ldquo;ประกาศตารางเวร&rdquo; เมื่อพร้อม
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2 pdf-hide">
          {[
            { id: 'all',      label: 'Total',    short: 'Total', value: totalCount, bg: 'bg-slate-100 hover:bg-slate-200',    text: 'text-slate-800',    num: 'text-slate-900'  },
            { id: 'เช้า',     label: 'เช้า',     short: 'เช้า',  value: chaoCount,  bg: 'bg-amber-100  hover:bg-amber-200',    text: 'text-amber-700',    num: 'text-amber-900'  },
            { id: 'บ่าย',     label: 'บ่าย',     short: 'บ่าย',  value: baiCount,   bg: 'bg-orange-100 hover:bg-orange-200',   text: 'text-orange-700',   num: 'text-orange-900' },
            { id: 'ดึก',      label: 'ดึก',      short: 'ดึก',   value: duekCount,  bg: 'bg-indigo-100 hover:bg-indigo-200',   text: 'text-indigo-700',   num: 'text-indigo-900' },
            { id: 'รุ่งอรุณ', label: 'รุ่งอรุณ', short: 'รุ่ง',  value: rungCount,  bg: 'bg-rose-100   hover:bg-rose-200',     text: 'text-rose-700',     num: 'text-rose-900'   },
          ].map(({ id, label, short, value, bg, text, num }) => (
            <div
              key={id}
              onClick={() => {
                if (currentUser) {
                  setPersonalShiftsFilter(id as ShiftType | 'all');
                  setShowPersonalShiftsModal(true);
                }
              }}
              className={cn(`rounded-xl border-0 p-1.5 sm:p-3 transition-all duration-200 ${bg}`, currentUser && value > 0 ? "cursor-pointer hover:scale-105 hover:shadow-md active:scale-95" : "")}
            >
              <div className="flex flex-col items-center sm:flex-row sm:items-center sm:gap-2">
                <p className={cn("text-base sm:text-xl font-extrabold leading-none", num)}>{value}</p>
                <p className={cn("text-[9px] sm:text-sm font-semibold opacity-90 leading-tight mt-0.5 sm:mt-0 text-center sm:text-left", text)}>
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div id="pdf-export-target" className="space-y-4 bg-white p-2">
          {/* PDF Title Header (hidden on web, shown in PDF) */}
          <div className="hidden pdf-show pb-2 border-b-2 border-gray-900 mb-4 flex justify-between items-end">
            <h2 className="text-2xl font-bold text-gray-900 pb-2">
              ตารางเวร{ROLE_LABELS[effectiveRoleGroup]}ประจำเดือน {formatThaiMonth(year, month)}
            </h2>
            <div className="text-right text-sm text-gray-500 pb-2">
              ข้อมูลอัพเดทเมื่อวันที่ {format(new Date(), 'd MMMM yyyy HH:mm น.', { locale: th })}
            </div>
          </div>

          {/* Legend */}
          {effectiveRoleGroup === 'pharmacist' && (
            <div className="flex flex-col gap-2 p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm max-w-2xl text-xs sm:text-sm font-medium">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <span className="text-amber-900">Med รายชื่อ 1 = D/C, รายชื่อ 2 = ยา Cont</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                <span className="text-orange-900">บ่าย ชื่อ 1 = บ่าย ER, ชื่อ 2 = บ่าย MED</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span className="text-rose-800">รุ่งอรุณ ชื่อ 1 = OPD, ชื่อ 2 = ER, ชื่อ 3 = HIV</span>
              </div>
            </div>
          )}
          {effectiveRoleGroup === 'pharmacy_technician' && (
            <div className="flex flex-col gap-2 p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm max-w-2xl text-xs sm:text-sm font-medium">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span className="text-rose-800">รุ่งอรุณ ชื่อ 1 = รุ่ง OPD, ชื่อ 2 = รุ่ง ER, ชื่อ 3 = รุ่ง HIV</span>
              </div>
            </div>
          )}
          {effectiveRoleGroup === 'officer' && (
            <div className="flex flex-col gap-2 p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm max-w-2xl text-xs sm:text-sm font-medium">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span className="text-rose-800">รุ่งอรุณ ช่อง 1 = รุ่ง OPD, ช่อง 2 = รุ่ง ER</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <span className="text-amber-900">เวรโครงการ วันหยุด ชื่อ 1 = 8.30 น., ชื่อ 2 = 9.00 น.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                <span className="text-indigo-900">วันปกติ ชื่อ 1 = รับที่ MED, ชื่อ 2 = รับที่ OPD</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                <span className="text-orange-900">บ่าย ER ชื่อ 1 = pre-pack, ชื่อ 2 = บ่ายห้องER</span>
              </div>
            </div>
          )}

          {/* Calendar */}
          <div ref={isMobile ? swipeRef : undefined} className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto", isMobile ? "p-0 border-0 shadow-none bg-transparent" : "p-2 sm:p-3")}>
            <div className={cn(!isMobile && "min-w-[360px]")}>
            {shiftsLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">กำลังโหลดตารางเวร...</span>
              </div>
            ) : !publishedRoles[effectiveRoleGroup] && !userIsAdminLike ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-lg font-medium text-gray-600">ตารางเวรตำแหน่งนี้ประจำเดือน {formatThaiMonth(year, month)} ยังไม่ถูกประกาศ</p>
                <p className="text-sm">กรุณารอการประกาศตารางเวรจากผู้ดูแลระบบ</p>
              </div>
            ) : viewMode === 'mine' ? (
              <MyCalendarGrid
                year={year}
                month={month}
                shifts={myShifts}
                holidays={holidays}
                onDayClick={handleDayClick}
              />
            ) : isMobile ? (
              <MobileCalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                holidays={holidays}
                onDayClick={handleMobileDayClick}
              />
            ) : effectiveRoleGroup === 'pharmacy_technician' ? (
              <PharmacyTechCalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                holidays={holidays}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                onShiftClick={handleShiftClick}
                viewMode={viewMode}
                isEditMode={isEditMode}
                pendingDeletes={pendingDeletes}
                pendingEdits={pendingEdits}
                onToggleDelete={handleToggleDelete}
                onEditShift={handleEditShiftFromCalendar}
                pendingAdds={pendingAdds}
                onAddShift={handleAddShift}
                onRemovePendingAdd={handleRemovePendingAdd}
              />
            ) : effectiveRoleGroup === 'officer' ? (
              <OfficeCalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                holidays={holidays}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                onShiftClick={handleShiftClick}
                viewMode={viewMode}
                isEditMode={isEditMode}
                pendingDeletes={pendingDeletes}
                pendingEdits={pendingEdits}
                onToggleDelete={handleToggleDelete}
                onEditShift={handleEditShiftFromCalendar}
                pendingAdds={pendingAdds}
                onAddShift={handleAddShift}
                onRemovePendingAdd={handleRemovePendingAdd}
              />
            ) : (
              <CalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                holidays={holidays}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                onShiftClick={handleShiftClick}
                viewMode={viewMode}
                isEditMode={isEditMode}
                pendingDeletes={pendingDeletes}
                pendingEdits={pendingEdits}
                onToggleDelete={handleToggleDelete}
                onEditShift={handleEditShiftFromCalendar}
                pendingAdds={pendingAdds}
                onAddShift={handleAddShift}
                onRemovePendingAdd={handleRemovePendingAdd}
              />
            )}
            </div>
          </div>

          {/* PDF Export Footer (hidden on web, shown in PDF) */}
          <div className="hidden pdf-show text-right text-sm text-gray-500 pt-4 pr-4">
            {/* The update text was moved to the header */}
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center pb-4 pdf-hide">
          คลิกที่ชื่อตัวเองเพื่อแลกเวร — คลิกชื่อคนอื่นเพื่อซื้อเวร
        </p>
      </main>

      {/* Swap Modal */}
      {selectedShift && (
        <SwapModal
          shift={selectedShift}
          currentUser={currentUser}
          onClose={() => setSelectedShift(null)}
        />
      )}

      {/* Notifications Panel */}
      {showNotifications && (
        <NotificationsPanel
          swapRequests={swapRequests}
          notifications={notifications}
          notifUnreadCount={notifUnreadCount}
          currentUser={currentUser}
          pendingCount={pendingCount}
          onAccept={handleAcceptSwap}
          onReject={rejectSwap}
          onCancel={cancelSwap}
          onMarkNotifsRead={markNotifsRead}
          onOpen={markRequesterRead}
          onClose={() => setShowNotifications(false)}
        />
      )}



      {/* Upload Modal */}
      {showUploadModal && (
        <ShiftUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => refetch()}
        />
      )}

      {/* Deploy Modal */}
      {showDeployModal && (
        <DeployModal
          initialYear={year}
          initialMonth={month}
          currentUser={currentUser}
          onClose={() => setShowDeployModal(false)}
          onSuccess={() => refetch()}
        />
      )}

      {/* Admin Settings Modal (วันหยุด + ผู้ใช้ + แจ้งเตือน) */}
      {showAdminSettings && (
        <AdminSettingsModal
          onClose={() => setShowAdminSettings(false)}
          onHolidaysChange={() => refetch()}
        />
      )}

      {/* Admin Replace Modal */}
      {editingSubsShift && isEditMode && (
        <AdminShiftSubstituteModal
          shift={editingSubsShift}
          onClose={() => setEditingSubsShift(null)}
          onSelectSubstitute={handleSelectSubstitute}
        />
      )}

      {/* Admin Confirm Submit Modal */}
      {showAdminConfirm && isEditMode && (
        <AdminConfirmModal
          pendingDeletes={pendingDeletes}
          pendingEdits={pendingEdits}
          pendingAdds={pendingAdds}
          allShifts={allShifts}
          currentUser={currentUser}
          onClose={() => setShowAdminConfirm(false)}
          onSuccess={() => {
            setShowAdminConfirm(false);
            setIsEditMode(false);
            setPendingDeletes(new Set());
            setPendingEdits({});
            setPendingAdds([]);
            refetch();
          }}
        />
      )}

      {/* Admin Add Shift Modal */}
      {addingShiftContext && isEditMode && (
        <AdminAddShiftModal
          context={addingShiftContext}
          roleGroup={effectiveRoleGroup}
          onClose={() => setAddingShiftContext(null)}
          onAdd={handleConfirmAdd}
        />
      )}

      {/* Mobile Day Detail Modal */}
      {mobileDaySelected && (
        <DayDetailModal
          day={mobileDaySelected}
          currentUser={currentUser}
          roleGroup={effectiveRoleGroup}
          onClose={() => setMobileDaySelected(null)}
          onSwapClick={(shift) => {
            setMobileDaySelected(null);
            handleShiftClick(shift);
          }}
        />
      )}

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <MobileBottomNav
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onBellClick={() => setShowNotifications(true)}
          pendingCount={pendingCount}
        />
      )}

      {/* Mobile Admin FAB Menu */}
      {isMobile && userIsAdminLike && (
        <MobileAdminMenu
          isEditMode={isEditMode}
          isSubAdmin={!userIsAdmin && currentUser?.is_sub_admin === true}
          onEditMode={handleToggleEditMode}
          onShowConfirm={() => setShowAdminConfirm(true)}
          onDeploy={() => setShowDeployModal(true)}
          onUpload={() => setShowUploadModal(true)}
          onSettings={() => setShowAdminSettings(true)}
          onCompensation={() => setShowCompensationModal(true)}
        />
      )}
    </>
  );
}
