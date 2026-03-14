'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, CalendarDay, Holiday } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameMonth, isToday } from 'date-fns';
import { SHIFT_CONFIG, DEPT_COLORS } from '@/lib/types';

interface MyCalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[]; // already filtered to only mine
  holidays: Holiday[];
  onDayClick: (day: CalendarDay) => void;
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
    // Don't generate extra weeks after the end of the month
    if (weeks[weeks.length - 1].length === 7 && current > monthEnd) break;
  }

  return weeks;
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}

export function MyCalendarGrid({ year, month, shifts, holidays, onDayClick }: MyCalendarGridProps) {
  const weeks = buildWeeks(year, month, shifts, holidays);

  return (
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
                    'min-h-[80px] sm:min-h-[120px] p-1.5 sm:p-2 border-r border-gray-200 last:border-r-0 relative transition-colors',
                    !day.isCurrentMonth && 'bg-gray-50/50 text-gray-400',
                    day.isCurrentMonth && 'hover:bg-violet-50/30 cursor-pointer text-gray-700',
                    day.isToday && 'bg-violet-50/50 ring-[4px] ring-red-500 [.exporting-pdf_&]:ring-0 ring-inset z-20'
                  )}
                >
                  {/* Day Number */}
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <span className={cn(
                      'text-xs sm:text-sm font-medium w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full',
                      day.isToday && 'bg-violet-600 text-white shadow-sm',
                      !day.isToday && isWeekend && day.isCurrentMonth && 'text-red-500'
                    )}>
                      {dayNum}
                    </span>
                    {hasShifts && (
                      <span className="text-[9px] sm:text-[10px] font-medium text-violet-600 bg-violet-100 px-1 sm:px-1.5 py-0.5 rounded-full">
                        {day.shifts.length}
                      </span>
                    )}
                  </div>

                  {/* Shifts List */}
                  <div className="space-y-1 mt-1 flex flex-col justify-center h-full">
                    {day.shifts.map((shift, i) => {
                      const cfg = SHIFT_CONFIG[shift.shift_type] || { icon: '•', color: '#9ca3af' };
                      const deptName = getDeptName(shift);
                      const deptColor = DEPT_COLORS[deptName as keyof typeof DEPT_COLORS] || '#cbd5e1';

                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[10px] sm:text-xs p-1 sm:p-1.5 rounded-lg border-2 border-violet-400 bg-gradient-to-r from-violet-600 to-purple-600 shadow-md shadow-violet-300/50 transition-all hover:shadow-lg hover:from-violet-700 hover:to-purple-700 overflow-hidden [.exporting-pdf_&]:overflow-visible [.exporting-pdf_&]:border [.exporting-pdf_&]:border-violet-300 [.exporting-pdf_&]:bg-none [.exporting-pdf_&]:shadow-none"
                        >
                          <div className="flex items-center gap-1.5 font-bold min-w-0 pr-1 text-white">
                            <span>{cfg.icon}</span>
                            <span className="truncate">{shift.shift_type}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] min-w-0">
                            <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-white/80" style={{ backgroundColor: deptColor }} />
                            <span className="font-bold text-white truncate">{deptName}</span>
                          </div>
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
  );
}
