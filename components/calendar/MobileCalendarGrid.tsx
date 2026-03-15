'use client';

import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Shift, Holiday, CalendarDay, ShiftType } from '@/lib/types';
import { SHIFT_CONFIG } from '@/lib/types';

interface MobileCalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  holidays: Holiday[];
  onDayClick: (day: CalendarDay) => void;
}

const THAI_DAY_ABBR = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const SHIFT_ORDER: ShiftType[] = ['เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ'];

function buildCalendarGrid(year: number, month: number, shifts: Shift[], holidays: Holiday[]): CalendarDay[] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return days.map(date => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return {
      date,
      shifts: shifts.filter(s => s.date === dateStr),
      isCurrentMonth: isSameMonth(date, monthStart),
      isToday: date.getTime() === today.getTime(),
      isHoliday: holidays.some(h => h.date === dateStr),
    };
  });
}

export function MobileCalendarGrid({ year, month, shifts, holidays, onDayClick }: MobileCalendarGridProps) {
  const days = buildCalendarGrid(year, month, shifts, holidays);

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

          return (
            <button
              key={format(day.date, 'yyyy-MM-dd')}
              onClick={() => day.isCurrentMonth ? onDayClick(day) : undefined}
              disabled={!day.isCurrentMonth}
              className={cn(
                'relative flex flex-col items-center justify-start pt-1.5 pb-1.5 min-h-[62px] border-r border-b border-gray-50 transition-colors select-none',
                day.isCurrentMonth
                  ? 'cursor-pointer active:bg-violet-50/80'
                  : 'opacity-20 pointer-events-none',
                day.isToday && 'bg-violet-50',
                !day.isToday && day.isHoliday && day.isCurrentMonth && 'bg-red-50/40',
              )}
            >
              {/* Day number circle */}
              <span
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-semibold mb-0.5',
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
