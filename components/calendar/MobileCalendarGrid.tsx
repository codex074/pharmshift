'use client';

import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Shift, Holiday, CalendarDay, ShiftType, User, UserRole } from '@/lib/types';
import { SHIFT_CONFIG } from '@/lib/types';
import { buildCalendarDays } from '@/lib/calendarMonthGrid';
import type { PendingAdd } from './AdminAddShiftModal';

interface MobileCalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  holidays: Holiday[];
  prevMonthLastDayShifts?: Shift[];
  onDayClick: (day: CalendarDay) => void;
  isEditMode?: boolean;
  roleGroup?: UserRole;
  pendingDeletes?: Set<string>;
  pendingEdits?: Record<string, User>;
  pendingAdds?: PendingAdd[];
}

const THAI_DAY_ABBR = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const SHIFT_ORDER: ShiftType[] = ['เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ'];

export function MobileCalendarGrid({
  year,
  month,
  shifts,
  holidays,
  prevMonthLastDayShifts,
  onDayClick,
  isEditMode = false,
  roleGroup,
  pendingDeletes,
  pendingEdits,
  pendingAdds,
}: MobileCalendarGridProps) {
  const days = buildCalendarDays(year, month, shifts, holidays, prevMonthLastDayShifts);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
        {THAI_DAY_ABBR.map((d, i) => (
          <div
            key={d}
            className={cn(
              'text-center py-2.5 text-[12px] font-bold tracking-wide',
              i === 0 ? 'text-red-500' : i === 6 ? 'text-indigo-500' : 'text-gray-500',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dow = day.date.getDay();
          const hasShifts = day.shifts.length > 0;
          const shiftTypes = SHIFT_ORDER.filter(t => day.shifts.some(s => s.shift_type === t));
          const hasPrevMonthShifts = !day.isCurrentMonth && hasShifts;
          const dateKey = format(day.date, 'yyyy-MM-dd');
          const hasPendingDayDelete = !!pendingDeletes && day.shifts.some((shift) => pendingDeletes.has(shift.id));
          const hasPendingDayEdit = !!pendingEdits && day.shifts.some((shift) => !!pendingEdits[shift.id]);
          const dayPendingAdds = (pendingAdds || []).filter((add) => add.date === dateKey).length;
          const hasPendingChanges = hasPendingDayDelete || hasPendingDayEdit || dayPendingAdds > 0;

          return (
            <button
              key={format(day.date, 'yyyy-MM-dd')}
              onClick={() => day.isCurrentMonth ? onDayClick(day) : undefined}
              disabled={!day.isCurrentMonth}
              className={cn(
                'relative flex flex-col items-center justify-start pt-1.5 pb-1.5 min-h-[62px] border-r border-b border-gray-50 transition-colors select-none',
                day.isCurrentMonth
                  ? 'cursor-pointer active:bg-violet-50/80'
                  : hasPrevMonthShifts
                  ? 'opacity-40 pointer-events-none'
                  : 'opacity-20 pointer-events-none',
                day.isToday && 'bg-violet-50',
                !day.isToday && day.isHoliday && day.isCurrentMonth && 'bg-red-50/40',
                isEditMode && day.isCurrentMonth && 'active:bg-emerald-50',
                hasPendingChanges && day.isCurrentMonth && 'bg-amber-50/50',
              )}
            >
              {isEditMode && day.isCurrentMonth && (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-bold leading-none">
                  แก้ไข
                </span>
              )}

              {/* Day number circle */}
              <span
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-full text-[19px] font-semibold mb-0.5 mt-2',
                  day.isToday
                    ? 'bg-violet-600 text-white shadow-sm'
                    : dow === 0 || (day.isHoliday && day.isCurrentMonth)
                    ? 'text-red-500'
                    : dow === 6
                    ? 'text-indigo-500'
                    : 'text-gray-700',
                )}
              >
                {format(day.date, 'd')}
              </span>

              {/* Shift type dots */}
              {hasShifts && (
                <div className="flex gap-[3px] justify-center flex-wrap px-1">
                  {shiftTypes.map(t => (
                    <span
                      key={t}
                      className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                      style={{ backgroundColor: SHIFT_CONFIG[t]?.color ?? '#9ca3af' }}
                    />
                  ))}
                </div>
              )}

              {/* Shift count */}
              {hasShifts && (
                <span className="text-[9px] text-gray-400 mt-0.5 leading-none">
                  {day.shifts.length}
                </span>
              )}

              {hasPendingChanges && day.isCurrentMonth && (
                <span className="mt-1 text-[8px] leading-none font-semibold text-amber-700">
                  {dayPendingAdds > 0 ? `+${dayPendingAdds}` : hasPendingDayDelete ? 'รอลบ' : 'รอแก้'}
                </span>
              )}

              {hasPrevMonthShifts && (
                <span className="text-[8px] text-gray-400 mt-0.5 leading-none font-medium">
                  {format(day.date, 'd')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isEditMode && roleGroup && (
        <div className="border-t border-gray-100 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-800 font-medium">
          แตะวันที่เพื่อจัดการเวรของ{roleGroup === 'pharmacist' ? 'เภสัชกร' : roleGroup === 'pharmacy_technician' ? 'จพ.เภสัชกรรม' : 'เจ้าหน้าที่'}ในวันนั้น
        </div>
      )}
    </div>
  );
}
