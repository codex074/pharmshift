'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, CalendarDay, Holiday } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';


interface MyCalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[]; // already filtered to only mine
  holidays: Holiday[];
  onDayClick: (day: CalendarDay) => void;
  onShiftClick?: (shift: Shift) => void;
  pendingShiftIds?: Set<string>;
}

function buildWeeks(year: number, month: number, shifts: Shift[], holidays: Holiday[]): CalendarDay[][] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });

  const weeks: CalendarDay[][] = [];
  let current = calStart;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (current <= monthEnd || (weeks.length > 0 && weeks[weeks.length - 1].length < 7)) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) {
      weeks.push([]);
    }
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const isHoliday = holidays.some(h => h.date === dateStr);

    weeks[weeks.length - 1].push({
      date: new Date(current),
      shifts: dayShifts,
      isCurrentMonth: current.getMonth() === month - 1,
      isToday: current.getTime() === today.getTime(),
      isHoliday,
    });

    current = addDays(current, 1);
    if (weeks[weeks.length - 1].length === 7 && current > monthEnd) break;
  }

  return weeks;
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}

export function MyCalendarGrid({ year, month, shifts, holidays, onDayClick, onShiftClick, pendingShiftIds }: MyCalendarGridProps) {
  // ── Improvement 3: Empty state ───────────────────────────────────────
  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <span className="text-5xl">📅</span>
        <p className="text-base font-semibold text-gray-500">ยังไม่มีเวรในเดือนนี้</p>
        <p className="text-xs text-gray-400 text-center max-w-[220px] leading-relaxed">
          หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ
        </p>
      </div>
    );
  }

  const weeks = buildWeeks(year, month, shifts, holidays);

  // ── Improvement 1: Stats counts ─────────────────────────────────────
  const chaoCount = shifts.filter(s => s.shift_type === 'เช้า').length;
  const baiCount  = shifts.filter(s => s.shift_type === 'บ่าย').length;
  const duekCount = shifts.filter(s => s.shift_type === 'ดึก').length;
  const rungCount = shifts.filter(s => s.shift_type === 'รุ่งอรุณ').length;

  const statPills = [
    { label: 'เช้า',     count: chaoCount, color: 'bg-amber-100  text-amber-700'  },
    { label: 'บ่าย',     count: baiCount,  color: 'bg-orange-100 text-orange-700' },
    { label: 'ดึก',      count: duekCount, color: 'bg-indigo-100 text-indigo-700' },
    { label: 'รุ่งอรุณ', count: rungCount, color: 'bg-rose-100   text-rose-700'   },
  ].filter(p => p.count > 0);

  return (
    <div className="space-y-3">
      {/* ── Stats Bar ── */}
      <div className="flex items-center gap-2 flex-wrap pdf-hide">
        {statPills.map(({ label, count, color }) => (
          <span key={label} className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', color)}>
            {label} {count}
          </span>
        ))}
        <span className="text-xs text-gray-400">รวม {shifts.length} เวร</span>
      </div>

      {/* ── Calendar Grid ── */}
      <div className="w-full border border-gray-200 rounded-xl overflow-hidden bg-white">
        {/* Header Row */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/80">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-2 sm:py-3 text-center text-[10px] sm:text-sm font-semibold',
              i === 0 ? 'text-red-500' : i === 6 ? 'text-indigo-500' : 'text-gray-600'
            )}>
              <span className="sm:hidden">{day.charAt(0)}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="flex flex-col">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-200 last:border-b-0">
              {week.map((day, di) => {
                const dayNum = format(day.date, 'd');
                const isWeekend = di === 0 || di === 6;
                const hasShifts = day.shifts.length > 0;

                return (
                  <div
                    key={di}
                    onClick={() => onDayClick(day)}
                    className={cn(
                      'min-h-[72px] sm:min-h-[120px] p-1 sm:p-2 border-r border-gray-200 last:border-r-0 relative transition-colors',
                      !day.isCurrentMonth && 'bg-gray-50/50 text-gray-400',
                      day.isCurrentMonth && 'hover:bg-violet-50/30 cursor-pointer text-gray-700',
                      day.isToday && 'bg-violet-50/50 ring-[4px] ring-red-500 [.exporting-pdf_&]:ring-0 ring-inset z-20'
                    )}
                  >
                    {/* Day Number */}
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className={cn(
                        'text-xs sm:text-base font-medium w-6 h-6 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shrink-0',
                        day.isToday && 'bg-violet-600 text-white shadow-sm',
                        !day.isToday && isWeekend && day.isCurrentMonth && 'text-red-500'
                      )}>
                        {dayNum}
                      </span>
                      {hasShifts && (
                        <span className="text-[8px] sm:text-[10px] font-medium text-violet-600 bg-violet-100 px-0.5 sm:px-1.5 py-0.5 rounded-full leading-none">
                          {day.shifts.length}
                        </span>
                      )}
                    </div>

                    {/* Shifts List */}
                    <div className="space-y-0.5 sm:space-y-1 flex flex-col">
                      {day.shifts.map((shift, i) => {
                        const deptName = getDeptName(shift);
                        const position = (shift as any).position;
                        const isPending = pendingShiftIds?.has(shift.id) ?? false;

                        // Full label (desktop)
                        let shiftLabel: string;
                        if (shift.shift_type === 'เช้า' && deptName === 'MED' && position) {
                          shiftLabel = `MED ${position}`;
                        } else if (shift.shift_type === 'เช้า' && deptName === 'SURG') {
                          shiftLabel = 'SURG';
                        } else if (deptName === 'Chemo') {
                          shiftLabel = 'Chemo';
                        } else if (shift.shift_type === 'บ่าย' && deptName === 'SMC') {
                          shiftLabel = 'SMC';
                        } else if (shift.shift_type === 'ดึก') {
                          shiftLabel = 'ดึก';
                        } else if (shift.shift_type === 'รุ่งอรุณ') {
                          shiftLabel = position ? `รุ่งอรุณ ${position}` : 'รุ่งอรุณ';
                        } else if (deptName === 'โครงการ') {
                          shiftLabel = 'โครงการ';
                        } else {
                          shiftLabel = `${shift.shift_type} ${deptName}`;
                        }

                        // Short label (mobile)
                        let mobileLabel: string;
                        if (shift.shift_type === 'รุ่งอรุณ') {
                          mobileLabel = position ? `รุ่ง${position}` : 'รุ่ง';
                        } else if (deptName === 'โครงการ') {
                          mobileLabel = 'Ext';
                        } else if (deptName === 'Chemo') {
                          mobileLabel = 'Chem';
                        } else if (deptName === 'ส่งยา สอ.' || deptName === 'สอ.') {
                          mobileLabel = 'สอ.';
                        } else if (deptName) {
                          mobileLabel = deptName;
                        } else {
                          mobileLabel = shift.shift_type;
                        }

                        return (
                          <div
                            key={i}
                            onClick={onShiftClick ? (e) => { e.stopPropagation(); onShiftClick(shift); } : undefined}
                            className={cn(
                              'relative flex items-center justify-center px-0.5 py-0.5 sm:p-1.5 rounded sm:rounded-lg border sm:border-2 border-violet-400 bg-gradient-to-r from-violet-600 to-purple-600 shadow-sm sm:shadow-md shadow-violet-300/50 transition-all hover:shadow-lg hover:from-violet-700 hover:to-purple-700 overflow-hidden [.exporting-pdf_&]:overflow-visible [.exporting-pdf_&]:border [.exporting-pdf_&]:border-violet-300 [.exporting-pdf_&]:bg-none [.exporting-pdf_&]:shadow-none',
                              onShiftClick && 'cursor-pointer active:scale-95',
                              isPending && 'ring-2 ring-amber-400 ring-offset-1',
                            )}
                          >
                            <span className="font-bold text-white leading-tight text-[9px] truncate sm:hidden">{mobileLabel}</span>
                            <span className="font-bold text-white leading-tight text-xs truncate hidden sm:block">{shiftLabel}</span>
                            {/* ── Improvement 2: Pending dot ── */}
                            {isPending && (
                              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse shadow-sm [.exporting-pdf_&]:hidden" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
