'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Lock, AlertTriangle, X } from 'lucide-react';
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
import { MobileEditDayModal } from '@/components/calendar/MobileEditDayModal';
import { DayDetailModal } from '@/components/calendar/DayDetailModal';
import { ShiftDetailModal } from '@/components/calendar/ShiftDetailModal';
import { SwapModal } from '@/components/swap/SwapModal';
import { NotificationsPanel } from '@/components/swap/NotificationsPanel';
import { AdminConfirmModal } from '@/components/calendar/AdminConfirmModal';
import { AdminShiftSubstituteModal } from '@/components/calendar/AdminShiftSubstituteModal';
import { AdminAddShiftModal } from '@/components/calendar/AdminAddShiftModal';
import { AdminManageShiftsModal } from '@/components/calendar/AdminManageShiftsModal';
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
import { PushEnableNudge } from '@/components/pwa/PushEnableNudge';
import { format, endOfMonth, subMonths, addMonths, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import type { Shift, CalendarDay, UserRole, User, ShiftType } from '@/lib/types';
import { SHIFT_CONFIG, DEPT_COLORS, ROLE_LABELS, STAFF_ROLES, isAdmin, isAdminLike, canManageRoleGroup } from '@/lib/types';
import { formatThaiMonth, cn, shiftsOverlap } from '@/lib/utils';
import {
  AFTERNOON_MED_SLOT_FULL_MESSAGE,
  DUPLICATE_SHIFT_MESSAGE,
  afternoonMedSlotKey,
  isAfternoonMedSlot,
  userShiftSlotKey,
} from '@/lib/shiftSlotRules';

const SHIFT_SELECT = `
  id,
  date,
  department_id,
  shift_type,
  position,
  user_id,
  original_user_id,
  user_snapshot,
  month_year,
  created_at,
  department:departments(id, name),
  user:users!user_id(id, prefix, f_name, l_name, nickname, profile_image, role),
  original_user:users!original_user_id(id, prefix, f_name, l_name, nickname, profile_image, role)
`;

// Slim select for the faded leading/trailing calendar days — no original_user join needed there
const SURROUNDING_SHIFT_SELECT = `
  id,
  date,
  department_id,
  shift_type,
  position,
  user_id,
  department:departments(id, name),
  user:users!user_id(id, prefix, f_name, l_name, nickname, profile_image, role)
`;

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null); // kept for MyCalendarGrid only
  const [detailShift, setDetailShift] = useState<import('@/lib/types').Shift | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showManageShiftsModal, setShowManageShiftsModal] = useState(false);
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
  const [mobileEditDaySelected, setMobileEditDaySelected] = useState<CalendarDay | null>(null);

  const { user: currentUser, loading: authLoading } = useCurrentUser();

  // Wait for currentUser (and the role-group correction below) before fetching
  // any shifts, so staff never fetch the 'pharmacist' default by mistake (R22).
  const [hasSyncedInitialRole, setHasSyncedInitialRole] = useState(false);
  useEffect(() => {
    if (!currentUser) return;
    if (STAFF_ROLES.includes(currentUser.role as UserRole)) {
      setViewRoleGroup(currentUser.role as UserRole);
    }
    setHasSyncedInitialRole(true);
  }, [currentUser]);
  const shiftsRoleGroup: UserRole | null = hasSyncedInitialRole ? viewRoleGroup : null;

  const { shifts: allShifts, holidays, isPublished, publishedRoles, loading: shiftsLoading, refetch } = useShifts(year, month, shiftsRoleGroup);
  const { notifications, unreadCount: notifUnreadCount, fetchNotifications, markAllRead: markNotifsRead } = useNotifications(currentUser?.id);

  const [prevMonthLastDayShifts, setPrevMonthLastDayShifts] = useState<Shift[]>([]);
  useEffect(() => {
    const prevMonthDate = subMonths(new Date(year, month - 1, 1), 1);
    const lastDay = endOfMonth(prevMonthDate);
    const lastDayStr = format(lastDay, 'yyyy-MM-dd');
    const prevMonthYear = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    supabase
      .from('shifts')
      .select(SHIFT_SELECT)
      .eq('month_year', prevMonthYear)
      .eq('date', lastDayStr)
      .then(({ data }) => { setPrevMonthLastDayShifts((data as unknown as Shift[]) ?? []); }); // decorative prev-month carry-over
  }, [year, month]);

  // Shifts for the leading/trailing overflow days shown (faded) to complete the calendar's first/last weeks.
  // Gated the same way as the main month: a role's shifts only show if that role is published
  // for the surrounding month, unless the viewer can manage that role group.
  const [surroundingMonthShifts, setSurroundingMonthShifts] = useState<Shift[]>([]);
  useEffect(() => {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfMonth(monthStart);
    const prevMonthDate = subMonths(monthStart, 1);
    const nextMonthDate = addMonths(monthStart, 1);
    const prevMonthYear = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const nextMonthYear = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

    Promise.all([
      supabase
        .from('published_months')
        .select('month_year, is_published, pharmacist_published, pharmacy_technician_published, officer_published')
        .in('month_year', [prevMonthYear, nextMonthYear]),
      supabase
        .from('shifts')
        .select(SURROUNDING_SHIFT_SELECT)
        .gte('date', format(addDays(monthStart, -7), 'yyyy-MM-dd'))
        .lte('date', format(addDays(monthStart, -1), 'yyyy-MM-dd')),
      supabase
        .from('shifts')
        .select(SURROUNDING_SHIFT_SELECT)
        .gte('date', format(addDays(monthEnd, 1), 'yyyy-MM-dd'))
        .lte('date', format(addDays(monthEnd, 7), 'yyyy-MM-dd')),
    ]).then(([publishRes, prevRes, nextRes]) => {
      const publishByMonth = new Map((publishRes.data ?? []).map((p) => [p.month_year, p]));
      const isRolePublished = (roleYearKey: string, role: UserRole | undefined) => {
        const p = publishByMonth.get(roleYearKey);
        if (role === 'pharmacy_technician') return p?.pharmacy_technician_published ?? p?.is_published ?? false;
        if (role === 'officer') return p?.officer_published ?? p?.is_published ?? false;
        if (role === 'pharmacist') return p?.pharmacist_published ?? p?.is_published ?? false;
        return false;
      };
      const canSeeRole = (role: UserRole | undefined, roleYearKey: string) =>
        canManageRoleGroup(currentUser, role as UserRole) || isRolePublished(roleYearKey, role);

      const prevShifts = (prevRes.data ?? []).filter((s: any) => canSeeRole(s.user?.role, prevMonthYear));
      const nextShifts = (nextRes.data ?? []).filter((s: any) => canSeeRole(s.user?.role, nextMonthYear));
      setSurroundingMonthShifts([...prevShifts, ...nextShifts] as unknown as Shift[]);
    });
  }, [year, month, currentUser]);

  // Auto-subscribe to push notifications when user is authenticated
  useEffect(() => {
    if (!currentUser?.id || authLoading) return;
    import('@/lib/pushNotifications').then(({ subscribeToPush, isPushSupported, isMobilePushDevice }) => {
      if (isPushSupported() && isMobilePushDevice()) subscribeToPush(currentUser.id);
    });
  }, [currentUser?.id, authLoading]);

  // Overlap warning banner state
  const [overlapDates, setOverlapDates] = useState<string[]>([]);
  const [overlapBannerDismissed, setOverlapBannerDismissed] = useState(false);

  // Check for overlapping shifts in current + next 2 months on login
  useEffect(() => {
    if (!currentUser?.id) return;
    const sessionKey = `overlap_dismissed_${currentUser.id}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey)) {
      setOverlapBannerDismissed(true);
      return;
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    const ahead = format(addMonths(new Date(), 2), 'yyyy-MM-dd');
    supabase
      .from('shifts')
      .select('date, shift_type')
      .eq('user_id', currentUser.id)
      .gte('date', today)
      .lte('date', ahead)
      .then(({ data }) => {
        if (!data?.length) return;
        const byDate: Record<string, string[]> = {};
        data.forEach(s => {
          if (!byDate[s.date]) byDate[s.date] = [];
          byDate[s.date].push(s.shift_type);
        });
        const found: string[] = [];
        Object.entries(byDate).forEach(([date, types]) => {
          outer: for (let i = 0; i < types.length; i++) {
            for (let j = i + 1; j < types.length; j++) {
              if (shiftsOverlap(types[i] as ShiftType, types[j] as ShiftType)) {
                found.push(date);
                break outer;
              }
            }
          }
        });
        if (found.length > 0) setOverlapDates(found.sort());
      });
  }, [currentUser?.id]);

  function dismissOverlapBanner() {
    if (currentUser?.id && typeof window !== 'undefined') {
      sessionStorage.setItem(`overlap_dismissed_${currentUser.id}`, '1');
    }
    setOverlapBannerDismissed(true);
  }

  const userIsAdmin = isAdmin(currentUser);
  const userIsAdminLike = isAdminLike(currentUser);

  const ownRoleGroup = STAFF_ROLES.includes(currentUser?.role as UserRole)
    ? (currentUser?.role as UserRole)
    : 'pharmacist';

  const effectiveRoleGroup: UserRole = viewRoleGroup;
  const canManageActiveRoleGroup = canManageRoleGroup(currentUser, effectiveRoleGroup);
  const activeRolePublished = publishedRoles[effectiveRoleGroup] ?? false;
  const canViewActiveRoleSchedule = canManageActiveRoleGroup || activeRolePublished;
  const canRequestSwapInActiveRole =
    !!currentUser
    && currentUser.role === effectiveRoleGroup
    && currentUser.role !== 'admin'
    && currentUser.is_active !== false
    && currentUser.is_readonly !== true
    && activeRolePublished;
  const activeEditMode = isEditMode && canManageActiveRoleGroup;

  useEffect(() => {
    if (isEditMode && !canManageActiveRoleGroup) {
      setIsEditMode(false);
      setPendingDeletes(new Set());
      setPendingEdits({});
      setPendingAdds([]);
      setMobileEditDaySelected(null);
      setEditingSubsShift(null);
      setAddingShiftContext(null);
    }
  }, [canManageActiveRoleGroup, isEditMode]);

  // Shifts for the active role group (used in "ทุกเวร" view)
  const shifts = allShifts.filter(s => (s.user as any)?.role === effectiveRoleGroup);

  // Previous month last day ดึก shifts filtered by role (used for Excel exports only)
  const prevMonthLastDayShiftsByRole = prevMonthLastDayShifts.filter(s => (s.user as any)?.role === effectiveRoleGroup);

  // Leading/trailing overflow-day shifts filtered by role (used for the on-screen calendar grids)
  const surroundingMonthShiftsByRole = surroundingMonthShifts.filter(s => (s.user as any)?.role === effectiveRoleGroup);

  // Publish guards — disable export buttons if the month hasn't been published
  const pharmacistPublished = publishedRoles.pharmacist ?? false;
  const myRoleKey = ownRoleGroup as keyof typeof publishedRoles;
  const myRolePublished = publishedRoles[myRoleKey] ?? false;
  const canViewOwnRoleSchedule = canManageRoleGroup(currentUser, ownRoleGroup) || myRolePublished;
  // "เวรของฉัน" always shows the user's own-role shifts, so gate swap actions on the
  // user's own role + own-role publish status (independent of the selected role tab).
  const canRequestSwapForMine =
    !!currentUser
    && currentUser.role === ownRoleGroup
    && currentUser.role !== 'admin'
    && currentUser.is_active !== false
    && currentUser.is_readonly !== true
    && myRolePublished;
  const {
    swapRequests, pendingCount, fetchSwaps, acceptSwap, rejectSwap, cancelSwap, markRequesterRead,
  } = useSwapRequests(currentUser?.id);

  async function handleAcceptSwap(req: Parameters<typeof acceptSwap>[0], force = false) {
    const result = await acceptSwap(req, force);
    if (result?.collision) return result;
    return result;
  }

  // Single source of truth for manual refresh from the header button.
  const refreshAll = useCallback(async () => {
    await Promise.all([refetch(), fetchNotifications(), fetchSwaps()]);
  }, [refetch, fetchNotifications, fetchSwaps]);

  function handleMonthChange(y: number, m: number) {
    setYear(y);
    setMonth(m);
  }

  function handleDayClick(day: CalendarDay) {
    if (!canViewActiveRoleSchedule) return;
    if (isMobile) setMobileDaySelected(day);
  }

  function handleMobileDayClick(day: CalendarDay) {
    if (!canViewActiveRoleSchedule) return;
    if (activeEditMode && viewMode === 'all') {
      setMobileEditDaySelected(day);
      return;
    }
    setMobileDaySelected(day);
  }

  function handleShiftClick(shift: Shift) {
    if (!canViewActiveRoleSchedule) return;
    if (activeEditMode) return; // Don't open swap modal in edit mode
    if (!canRequestSwapInActiveRole) {
      const shiftRole = (shift.user as any)?.role as UserRole | undefined;
      if (shiftRole && shiftRole !== currentUser?.role) {
        toastError('ดูตารางเวร role อื่นได้อย่างเดียว ไม่สามารถทำรายการกับเวรของ role อื่นได้');
      }
      return;
    }
    if (currentUser?.is_active === false) {
      toastError('บัญชีของคุณถูกระงับ — ไม่สามารถแลก/ซื้อเวรได้');
      return;
    }
    setMobileDaySelected(null); // close day detail modal if open
    setSelectedShift(shift);
  }

  function handleToggleEditMode() {
    if (!canManageActiveRoleGroup) {
      toastError('คุณไม่มีสิทธิ์จัดการตารางเวรของ role นี้');
      return;
    }
    const nextEditMode = !isEditMode;
    setIsEditMode(nextEditMode);
    if (nextEditMode) {
      setViewMode('all');
      setMobileDaySelected(null);
      setMobileEditDaySelected(null);
      setSelectedShift(null);
      setDetailShift(null);
    } else {
      setMobileEditDaySelected(null);
    }
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
    if (!activeEditMode) return;
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
    const addSlot = {
      date: add.date,
      shift_type: add.shift_type,
      department: add.department,
      position: add.position,
      userId: add.user.id,
    };
    const addUserSlotKey = userShiftSlotKey(addSlot);

    const alreadyPendingSameUserSlot = pendingAdds.some((pending) =>
      userShiftSlotKey({
        date: pending.date,
        shift_type: pending.shift_type,
        department: pending.department,
        position: pending.position,
        userId: pending.user.id,
      }) === addUserSlotKey
    );

    const alreadyExistingSameUserSlot = shifts.some((shift) =>
      !pendingDeletes.has(shift.id) &&
      userShiftSlotKey({
        date: shift.date,
        shift_type: shift.shift_type,
        department: shift.department?.name || shift.department_name || '',
        position: shift.position || '',
        userId: shift.user_id,
      }) === addUserSlotKey
    );

    if (alreadyPendingSameUserSlot || alreadyExistingSameUserSlot) {
      toastError(DUPLICATE_SHIFT_MESSAGE);
      setAddingShiftContext(null);
      return;
    }

    if (isAfternoonMedSlot(addSlot)) {
      const addMedKey = afternoonMedSlotKey(addSlot, add.user.role);
      const alreadyPendingMed = pendingAdds.some((pending) =>
        isAfternoonMedSlot({
          date: pending.date,
          shift_type: pending.shift_type,
          department: pending.department,
          position: pending.position,
        }) &&
        afternoonMedSlotKey({
          date: pending.date,
          shift_type: pending.shift_type,
          department: pending.department,
          position: pending.position,
        }, pending.user.role) === addMedKey
      );
      const alreadyExistingMed = shifts.some((shift) =>
        !pendingDeletes.has(shift.id) &&
        isAfternoonMedSlot({
          date: shift.date,
          shift_type: shift.shift_type,
          department: shift.department?.name || shift.department_name || '',
          position: shift.position || '',
        }) &&
        afternoonMedSlotKey({
          date: shift.date,
          shift_type: shift.shift_type,
          department: shift.department?.name || shift.department_name || '',
          position: shift.position || '',
        }, (shift.user as any)?.role || effectiveRoleGroup) === addMedKey
      );

      if (alreadyPendingMed || alreadyExistingMed) {
        toastError(AFTERNOON_MED_SLOT_FULL_MESSAGE);
        setAddingShiftContext(null);
        return;
      }
    }

    setPendingAdds(prev => [...prev, add]);
    setAddingShiftContext(null);
  }

  function handleRemovePendingAdd(index: number) {
    setPendingAdds(prev => prev.filter((_, i) => i !== index));
  }

  // Stats cards always show only the current user's shifts for the viewed calendar month.
  const viewedMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const myShifts  = allShifts.filter((s) => {
    if (s.user_id !== currentUser?.id) return false;
    const shiftMonthKey = s.month_year || s.date.slice(0, 7);
    return shiftMonthKey === viewedMonthKey;
  });
  // Improvement 2: shift IDs with outgoing pending requests
  const pendingShiftIds = new Set(
    swapRequests
      .filter(r => r.status === 'pending' && r.requester_id === currentUser?.id)
      .map(r => r.shift_id)
      .filter(Boolean) as string[]
  );
  // For non-admin users: hide all shift counts/data when the month isn't published for their role
  const visibleShifts    = !canViewActiveRoleSchedule ? [] : shifts;
  const visibleMyShifts  = !canViewOwnRoleSchedule ? [] : myShifts;
  const visibleSource    = visibleMyShifts;
  const totalCount = visibleSource.length;
  const chaoCount = visibleSource.filter((s) => s.shift_type === 'เช้า').length;
  const baiCount  = visibleSource.filter((s) => s.shift_type === 'บ่าย').length;
  const duekCount = visibleSource.filter((s) => s.shift_type === 'ดึก').length;
  const rungCount = visibleSource.filter((s) => s.shift_type === 'รุ่งอรุณ').length;

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
        onRefresh={refreshAll}
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
        shifts={[
          ...visibleMyShifts,
          ...prevMonthLastDayShifts.filter((shift) =>
            shift.user_id === currentUser?.id && shift.shift_type === 'ดึก'
          ),
        ]}
        currentUser={currentUser}
        month={month}
        year={year}
      />
        {/* Overlap warning banner */}
        {overlapDates.length > 0 && !overlapBannerDismissed && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border-2 border-amber-400 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">⚠️ มีเวรซ้อนกัน — กรุณารีบจัดการ</p>
              <p className="text-xs text-amber-700 mt-1">
                วันที่มีเวรซ้อน: {overlapDates.map(d => format(new Date(d + 'T00:00:00'), 'd MMM yyyy', { locale: th })).join(', ')}
              </p>
            </div>
            <button
              onClick={dismissOverlapBanner}
              className="text-amber-400 hover:text-amber-600 p-1 transition-colors shrink-0"
              title="ปิดการแจ้งเตือน"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Page title + actions */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {viewMode === 'mine' ? 'เวรของฉัน' : `ตารางเวร${ROLE_LABELS[effectiveRoleGroup]}`}
            </h1>
            <p className="text-sm text-gray-400 mt-1 font-medium tracking-wide">{formatThaiMonth(year, month)}</p>
          </div>
        {/* Desktop action buttons — unified dark/violet palette */}
        <div className={cn("flex items-center gap-1.5 flex-wrap", isMobile && "hidden")}>
            {userIsAdmin && (
              <button
                onClick={() => setShowAdminSettings(true)}
                className="bg-gray-900 text-white hover:bg-gray-800 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-md"
              >
                <span>⚙️</span>
                <span className="sm:hidden">ตั้งค่า</span>
                <span className="hidden sm:inline">ตั้งค่าระบบ</span>
              </button>
            )}
            {canManageActiveRoleGroup && (
              <>
                {isEditMode ? (
                  <>
                    <button
                      onClick={() => setShowAdminConfirm(true)}
                      className="text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-lg hover:shadow-xl"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                    >
                      <span>✅</span>
                      <span>ยืนยันการแก้ไข</span>
                    </button>
                    <button
                      onClick={handleToggleEditMode}
                      className="bg-gray-900 text-white hover:bg-gray-800 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-md"
                    >
                      <span>❌</span>
                      <span>ยกเลิก</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowManageShiftsModal(true)}
                    className="text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-lg hover:shadow-xl"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}
                  >
                    <span>🛠️</span>
                    <span>จัดการเวร</span>
                  </button>
                )}
                <button
                  onClick={() => setShowDeployModal(true)}
                  className="text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-lg hover:shadow-xl"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  <span>📢</span>
                  <span className="sm:hidden">ประกาศ</span>
                  <span className="hidden sm:inline">ประกาศตารางเวร</span>
                </button>
              </>
            )}
        <ScheduleTableExportButton shifts={allShifts} holidays={holidays} year={year} month={month} isPublished={activeRolePublished} isAdminLike={canManageActiveRoleGroup} prevMonthLastDayShifts={prevMonthLastDayShifts} currentUserId={currentUser?.id} currentUserName={currentUser?.f_name} roleGroup={effectiveRoleGroup} />
            {currentUser && (
              <div className="relative group">
                <button
                  onClick={() => myRolePublished ? setShowCompensationModal(true) : toastError('ยังไม่ได้ประกาศตารางเวรเดือนนี้')}
                  className="text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-lg hover:shadow-xl"
                  style={{ background: myRolePublished ? 'linear-gradient(135deg, #f59e0b, #d97706)' : undefined, backgroundColor: myRolePublished ? undefined : '#9ca3af', opacity: myRolePublished ? undefined : 0.85 }}
                >
                  {myRolePublished ? <span>💰</span> : <Lock className="w-3.5 h-3.5" />}
                  <span>ค่าตอบแทน</span>
                </button>
                {!myRolePublished && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                    <div className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                      ยังไม่ได้ประกาศตารางเวรเดือนนี้
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                    </div>
                  </div>
                )}
              </div>
            )}
            {canManageActiveRoleGroup && (
              <button
                onClick={() => setShowAdminExportModal(true)}
                className="bg-gray-900 text-white hover:bg-gray-800 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 active:scale-95 shadow-md"
              >
                <span>📊</span>
                <span className="sm:hidden">Export</span>
                <span className="hidden sm:inline">Export Excel</span>
              </button>
            )}
          </div>

          {/* Mobile: compensation button for non-admin users */}
          {isMobile && currentUser && !userIsAdminLike && (
            <div className="relative group">
              <button
                onClick={() => myRolePublished ? setShowCompensationModal(true) : toastError('ยังไม่ได้ประกาศตารางเวรเดือนนี้')}
                className="text-white font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 active:scale-95 shadow-lg"
                style={{ background: myRolePublished ? 'linear-gradient(135deg, #f59e0b, #d97706)' : undefined, backgroundColor: myRolePublished ? undefined : '#9ca3af', opacity: myRolePublished ? undefined : 0.85 }}
              >
                {myRolePublished ? <span>💰</span> : <Lock className="w-3 h-3" />}
                <span>ค่าตอบแทน</span>
              </button>
              {!myRolePublished && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                    ยังไม่ได้ประกาศตารางเวรเดือนนี้
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Role group tab switcher */}
        {currentUser && (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            <div className="flex items-center gap-1 p-1 rounded-2xl w-max min-w-full sm:w-auto shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0f0a2e, #1a1145, #2d1b69)' }}
            >
              {STAFF_ROLES.map((role) => {
                const isActive = viewRoleGroup === role;

                return (
                  <button
                    key={role}
                    onClick={() => setViewRoleGroup(role)}
                    className={cn(
                      'px-5 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap tracking-tight active:scale-95',
                      isActive
                        ? 'bg-white text-gray-900 shadow-lg'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!activeRolePublished && canManageActiveRoleGroup && (
          <div className="border border-amber-300/40 text-amber-100 rounded-2xl p-3.5 text-sm flex items-center gap-3 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #92400e, #78350f)' }}
          >
            <span className="text-lg">⚠️</span>
            <span className="font-semibold">ตารางเวรตำแหน่งนี้ยังไม่ถูกประกาศให้ผู้ใช้ทั่วไปเห็น กรุณาตรวจสอบความถูกต้องและกด &ldquo;ประกาศตารางเวร&rdquo; เมื่อพร้อม</span>
          </div>
        )}

        {/* Stats cards — gradient backgrounds */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 pdf-hide">
          {[
            { id: 'all',      label: 'Total',    short: 'Total', value: totalCount, gradient: 'linear-gradient(135deg, #334155, #1e293b)' },
            { id: 'เช้า',     label: 'เช้า',     short: 'เช้า',  value: chaoCount,  gradient: 'linear-gradient(135deg, #2dd4bf, #0f766e)' }, // Teal/Cyan
            { id: 'บ่าย',     label: 'บ่าย',     short: 'บ่าย',  value: baiCount,   gradient: 'linear-gradient(135deg, #a855f7, #7e22ce)' }, // Purple
            { id: 'ดึก',      label: 'ดึก',      short: 'ดึก',   value: duekCount,  gradient: 'linear-gradient(135deg, #818cf8, #4338ca)' }, // Periwinkle/Indigo
            { id: 'รุ่งอรุณ', label: 'รุ่งอรุณ', short: 'รุ่ง',  value: rungCount,  gradient: 'linear-gradient(135deg, #fbbf24, #d97706)' }, // Amber
          ].map(({ id, label, short, value, gradient }) => (
            <div
              key={id}
              onClick={() => {
                if (currentUser && canViewOwnRoleSchedule) {
                  setPersonalShiftsFilter(id as ShiftType | 'all');
                  setShowPersonalShiftsModal(true);
                }
              }}
              className={cn(
                'rounded-xl p-2 sm:p-3 transition-all duration-300 shadow text-white relative overflow-hidden',
                currentUser && value > 0 && canViewOwnRoleSchedule
                  ? 'cursor-pointer hover:scale-[1.03] hover:shadow-md active:scale-[0.97]'
                  : 'cursor-default'
              )}
              style={{ background: gradient }}
            >
              {/* Decorative circle */}
              <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-white/10" />
              <div className="relative z-10">
                <p className="text-xl sm:text-2xl font-extrabold leading-none tracking-tight">{value}</p>
                <p className="text-[10px] sm:text-xs font-bold opacity-90 mt-0.5 tracking-wide">
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div id="pdf-export-target" className="space-y-4 bg-white rounded-2xl p-2 sm:p-3 shadow-sm border border-gray-100/60">
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
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <span className="text-amber-900">Med รายชื่อ 1 = D/C, รายชื่อ 2 = IPD</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                <span className="text-orange-900">บ่าย ชื่อ 1 = บ่าย ER, ชื่อ 2 = บ่าย MED</span>
              </div>
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
                <span className="text-orange-900">เวรบ่าย ชื่อบน = บ่าย ER, ชื่อล่าง = บ่าย MED</span>
              </div>
            </div>
          )}

          {/* Calendar */}
          <div ref={isMobile ? swipeRef : undefined} className={cn("bg-white rounded-2xl overflow-x-auto", isMobile ? "p-0 border-0 shadow-none bg-transparent" : "p-1 sm:p-2")}>
            <div className={cn(!isMobile && "min-w-[360px]")}>
            {shiftsLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">กำลังโหลดตารางเวร...</span>
              </div>
            ) : !canViewActiveRoleSchedule ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-lg font-medium text-gray-600">ตารางเวรตำแหน่งนี้ประจำเดือน {formatThaiMonth(year, month)} ยังไม่ถูกประกาศ</p>
                <p className="text-sm">กรุณารอการประกาศตารางเวรจากผู้ดูแลระบบ</p>
              </div>
            ) : viewMode === 'mine' ? (
              <MyCalendarGrid
                year={year}
                month={month}
                shifts={visibleMyShifts}
                holidays={holidays}
                prevMonthLastDayShifts={surroundingMonthShifts.filter(s => s.user_id === currentUser?.id)}
                onDayClick={handleDayClick}
                onShiftClick={(s) => {
                  // คลิกชื่อตัวเอง → เปิด SwapModal (โอน/ยกเวร) เหมือนหน้า "ทุกเวร";
                  // ถ้าส่งคำขอไม่ได้ (readonly/admin/ยังไม่ประกาศ) ตกไปที่ modal รายละเอียดเดิม
                  if (canRequestSwapForMine) setSelectedShift(s);
                  else if (canViewOwnRoleSchedule) setDetailShift(s);
                }}
                pendingShiftIds={pendingShiftIds}
              />
            ) : isMobile ? (
              <MobileCalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                holidays={holidays}
                prevMonthLastDayShifts={surroundingMonthShiftsByRole}
                onDayClick={handleMobileDayClick}
                isEditMode={activeEditMode && viewMode === 'all'}
                roleGroup={effectiveRoleGroup}
                pendingDeletes={pendingDeletes}
                pendingEdits={pendingEdits}
                pendingAdds={pendingAdds}
              />
            ) : effectiveRoleGroup === 'pharmacy_technician' ? (
              <PharmacyTechCalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                holidays={holidays}
                prevMonthLastDayShifts={surroundingMonthShiftsByRole}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                onShiftClick={canRequestSwapInActiveRole ? handleShiftClick : undefined}
                viewMode={viewMode}
                isEditMode={activeEditMode}
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
                prevMonthLastDayShifts={surroundingMonthShiftsByRole}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                onShiftClick={canRequestSwapInActiveRole ? handleShiftClick : undefined}
                viewMode={viewMode}
                isEditMode={activeEditMode}
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
                prevMonthLastDayShifts={surroundingMonthShiftsByRole}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                onShiftClick={canRequestSwapInActiveRole ? handleShiftClick : undefined}
                viewMode={viewMode}
                isEditMode={activeEditMode}
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

        <p className="text-[10px] text-gray-400 text-center pb-4 pdf-hide font-medium">
          คลิกชื่อตัวเองเพื่อโอนเวร · คลิกชื่อคนอื่นเพื่อขอแลกเวร
        </p>
      </main>

      {/* Shift Detail Modal (เวรของฉัน) */}
      {detailShift && currentUser && (
        <ShiftDetailModal
          shift={detailShift}
          currentUserId={currentUser.id}
          onClose={() => setDetailShift(null)}
        />
      )}

      {/* Swap Modal */}
      {selectedShift && (
        <SwapModal
          shift={selectedShift}
          currentUser={currentUser}
          publishedRoles={publishedRoles}
          userShifts={currentUser ? allShifts.filter(s => s.user_id === currentUser.id) : []}
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



      {/* Manage Shifts chooser (โหมดแก้ไข / เพิ่มเวร) */}
      {showManageShiftsModal && (
        <AdminManageShiftsModal
          onClose={() => setShowManageShiftsModal(false)}
          onEditMode={handleToggleEditMode}
          onUpload={() => setShowUploadModal(true)}
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
          currentUser={currentUser}
        />
      )}

      {/* Admin Replace Modal */}
      {editingSubsShift && activeEditMode && (
        <AdminShiftSubstituteModal
          shift={editingSubsShift}
          onClose={() => setEditingSubsShift(null)}
          onSelectSubstitute={handleSelectSubstitute}
        />
      )}

      {/* Admin Confirm Submit Modal */}
      {showAdminConfirm && activeEditMode && (
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
      {addingShiftContext && activeEditMode && (
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
          canRequestAction={canRequestSwapInActiveRole}
          onClose={() => setMobileDaySelected(null)}
          onSwapClick={(shift) => {
            setMobileDaySelected(null);
            handleShiftClick(shift);
          }}
        />
      )}

      {mobileEditDaySelected && activeEditMode && viewMode === 'all' && (
        <MobileEditDayModal
          day={mobileEditDaySelected}
          roleGroup={effectiveRoleGroup}
          pendingDeletes={pendingDeletes}
          pendingEdits={pendingEdits}
          pendingAdds={pendingAdds}
          onClose={() => setMobileEditDaySelected(null)}
          onToggleDelete={handleToggleDelete}
          onEditShift={handleEditShiftFromCalendar}
          onAddShift={handleAddShift}
          onRemovePendingAdd={handleRemovePendingAdd}
        />
      )}

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <MobileBottomNav
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onBellClick={() => setShowNotifications(true)}
          pendingCount={pendingCount}
          isEditMode={activeEditMode}
        />
      )}

      {/* Mobile Admin FAB Menu */}
      {isMobile && canManageActiveRoleGroup && (
        <MobileAdminMenu
          isEditMode={activeEditMode}
          isSubAdmin={!userIsAdmin && currentUser?.is_sub_admin === true}
          onEditMode={handleToggleEditMode}
          onShowConfirm={() => setShowAdminConfirm(true)}
          onDeploy={() => setShowDeployModal(true)}
          onManageShifts={() => setShowManageShiftsModal(true)}
          onSettings={() => setShowAdminSettings(true)}
          onCompensation={() => setShowCompensationModal(true)}
        />
      )}

      <PushEnableNudge userId={currentUser?.id} />
    </>
  );
}
