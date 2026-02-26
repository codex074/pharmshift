'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toastSuccess, toastError } from '@/lib/swal';
import { useShifts, useSwapRequests, useCurrentUser } from '@/hooks/useShifts';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { MyCalendarGrid } from '@/components/calendar/MyCalendarGrid';
import { DayDetailModal } from '@/components/calendar/DayDetailModal';
import { SwapModal } from '@/components/swap/SwapModal';
import { NotificationsPanel } from '@/components/swap/NotificationsPanel';
import { ExportButton } from '@/components/ExportButton';
import { ExcelExportButton } from '@/components/ExcelExportButton';
import { PdfExportButton } from '@/components/PdfExportButton';
import { ShiftUploadModal } from '@/components/calendar/ShiftUploadModal';
import { Header } from '@/components/layout/Header';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import type { Shift, CalendarDay } from '@/lib/types';
import { SHIFT_CONFIG, DEPT_COLORS } from '@/lib/types';
import { formatThaiMonth } from '@/lib/utils';

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');

  const { user: currentUser, loading: authLoading } = useCurrentUser();
  const { shifts, isPublished, loading: shiftsLoading, refetch } = useShifts(year, month);
  const {
    swapRequests, pendingCount, acceptSwap, rejectSwap,
  } = useSwapRequests(currentUser?.id);

  async function handleAcceptSwap(req: Parameters<typeof acceptSwap>[0]) {
    await acceptSwap(req);
    refetch();
  }

  async function handleDeploy() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      const monthYear = format(new Date(year, month - 1), 'yyyy-MM');
      const { error } = await supabase
        .from('published_months')
        .upsert({
          month_year: monthYear,
          is_published: true,
          published_at: new Date().toISOString(),
          published_by: currentUser.id,
        });

      if (error) throw error;
      await toastSuccess('ประกาศตารางเวรสำเร็จแล้ว!');
      refetch();
    } catch (err: any) {
      await toastError('เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  function handleMonthChange(y: number, m: number) {
    setYear(y);
    setMonth(m);
  }

  function handleDayClick(day: CalendarDay) {
    if (day.isCurrentMonth) {
      setSelectedDay(day);
    }
  }

  function handleSwapClickFromDay(shift: Shift) {
    setSelectedDay(null);
    setSelectedShift(shift);
  }

  // Stats
  const myShifts  = shifts.filter((s) => s.user_id === currentUser?.id);
  const chaoCount = shifts.filter((s) => s.shift_type === 'เช้า').length;
  const baiCount  = shifts.filter((s) => s.shift_type === 'บ่าย').length;
  const duekCount = shifts.filter((s) => s.shift_type === 'ดึก').length;
  const rungCount = shifts.filter((s) => s.shift_type === 'รุ่งอรุณ').length;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-header">
        <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          <p className="text-gray-600 text-sm">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header
        currentUser={currentUser}
        pendingCount={pendingCount}
        onBellClick={() => setShowNotifications(true)}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <main className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">
        {/* Page title + actions */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {viewMode === 'mine' ? 'เวรของฉัน' : 'ตารางเวรเภสัชกร'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{formatThaiMonth(year, month)}</p>
          </div>
        <div className="flex items-center gap-2">
            {!isPublished && currentUser?.role === 'admin' && (
              <button
                onClick={handleDeploy}
                className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800 font-medium px-4 py-2 rounded-xl text-sm transition-colors shadow-sm flex items-center gap-2"
              >
                ประกาศตารางเวร
              </button>
            )}
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 font-medium px-4 py-2 rounded-xl text-sm transition-colors shadow-sm flex items-center gap-2"
              >
                เพิ่มเวร (CSV)
              </button>
            )}
            <PdfExportButton targetId="pdf-export-target" filename={`ตารางเวร_${format(new Date(year, month - 1), 'MMMM_yyyy', { locale: th })}`} />
            <ExcelExportButton shifts={shifts} year={year} month={month} />
            <ExportButton shifts={viewMode === 'mine' ? myShifts : shifts} year={year} month={month} />
          </div>
        </div>

        {!isPublished && currentUser?.role === 'admin' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm flex items-center gap-2">
            ⚠️ ตารางเวรเดือนนี้ยังไม่ถูกประกาศให้ผู้ใช้ทั่วไปเห็น กรุณาตรวจสอบความถูกต้องและกด "ประกาศตารางเวร" เมื่อพร้อม
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pdf-hide">
          {[
            { label: 'ทั้งหมด',  value: shifts.length, color: 'bg-gray-50  text-gray-700  border-gray-100' },
            { label: '🌅 เช้า',   value: chaoCount,     color: 'bg-amber-50 text-amber-700 border-amber-100' },
            { label: '☀️ บ่าย',   value: baiCount,      color: 'bg-cyan-50  text-cyan-700  border-cyan-100' },
            { label: '🌙 ดึก',    value: duekCount,     color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
            { label: '🌄 รุ่งอรุณ', value: rungCount,   color: 'bg-orange-50 text-orange-700 border-orange-100' },
            { label: '⭐ เวรฉัน', value: myShifts.length, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-[10px] font-medium opacity-70">{label}</p>
            </div>
          ))}
        </div>

        <div id="pdf-export-target" className="space-y-4 bg-white p-2">
          {/* PDF Title Header (hidden on web, shown in PDF) */}
          <div className="hidden pdf-show pb-2">
            <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-900 pb-2 mb-4">
              ตารางเวรเภสัชกรประจำเดือน {formatThaiMonth(year, month)}
            </h2>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-orange-400 bg-pink-100/50 shadow-sm max-w-2xl text-sm font-medium">
            <div className="text-green-700">
              Med รายชื่อ1 = D/C , รายชื่อ 2 = ยา Cont
            </div>
            <div className="text-orange-900">
              บ่าย ชื่อ1 = บ่าย ER ,รายชื่อ 2 =บ่าย MED
            </div>
            <div className="text-red-600">
              รุ่งอรุณ ชื่อ 1 = OPD ชื่อ 2 = ER ชื่อ 3 = HIV
            </div>
          </div>

          {/* Calendar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            {shiftsLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">กำลังโหลดตารางเวร...</span>
              </div>
            ) : !isPublished && currentUser?.role !== 'admin' ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-lg font-medium text-gray-600">ตารางเวรเดือน {formatThaiMonth(year, month)} ยังไม่ถูกประกาศ</p>
                <p className="text-sm">กรุณารอการประกาศตารางเวรจากผู้ดูแลระบบ</p>
              </div>
            ) : viewMode === 'mine' ? (
              <MyCalendarGrid
                year={year}
                month={month}
                shifts={myShifts}
                onDayClick={handleDayClick}
              />
            ) : (
              <CalendarGrid
                year={year}
                month={month}
                shifts={shifts}
                currentUser={currentUser}
                onDayClick={handleDayClick}
                viewMode={viewMode}
              />
            )}
          </div>

          {/* PDF Export Footer (hidden on web, shown in PDF) */}
          <div className="hidden pdf-show text-right text-sm text-gray-500 pt-4 pr-4">
            ข้อมูลอัพเดทเมื่อวันที่ {format(new Date(), 'd MMMM yyyy HH:mm น.', { locale: th })}
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center pb-4 pdf-hide">
          คลิกที่วันเพื่อดูรายละเอียดเวร — คลิกชื่อเพื่อขอแลกเวร
        </p>
      </main>

      {/* Day Detail Modal */}
      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          currentUser={currentUser}
          onClose={() => setSelectedDay(null)}
          onSwapClick={handleSwapClickFromDay}
        />
      )}

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
          currentUser={currentUser}
          pendingCount={pendingCount}
          onAccept={handleAcceptSwap}
          onReject={rejectSwap}
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
    </>
  );
}
