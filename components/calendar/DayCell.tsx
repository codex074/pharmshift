'use client';

import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarDay, User } from '@/lib/types';
import { getSlotsForDate, DEPT_COLORS, SHIFT_CONFIG, ShiftType } from '@/lib/types';

interface DayCellProps {
  day: CalendarDay;
  currentUser: User | null;
  onClick: (day: CalendarDay) => void;
  viewMode: 'all' | 'mine';
}

export function DayCell({ day, currentUser, onClick, viewMode }: DayCellProps) {
  const dayNumber = format(day.date, 'd');
  const dow = day.date.getDay();
  const isWeekend = dow === 0 || dow === 6;

  // Get expected slot structure for this day
  const shiftGroups = day.isCurrentMonth ? getSlotsForDate(day.date, day.isHoliday) : [];

  // Count filled shifts
  const filledCount = day.shifts.length;
  const totalSlots = shiftGroups.reduce((sum, g) => sum + g.slots.reduce((s, sl) => s + sl.count, 0), 0);

  return (
    <div
      onClick={() => onClick(day)}
      className={cn(
        'day-cell group cursor-pointer hover:ring-2 hover:ring-violet-400/40 transition-all duration-150 relative',
        day.isToday && 'today',
        !day.isCurrentMonth && 'other-month',
        isWeekend && day.isCurrentMonth && 'bg-amber-50/30',
      )}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-0.5">
        <span className={cn(
          'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
          day.isToday
            ? 'bg-violet-600 text-white'
            : isWeekend && day.isCurrentMonth
              ? 'text-red-500'
              : day.isCurrentMonth
                ? 'text-gray-700'
                : 'text-gray-300'
        )}>
          {dayNumber}
        </span>
        {day.isCurrentMonth && isWeekend && (
          <span className="text-[7px] text-red-400 font-medium">หยุด</span>
        )}
      </div>

      {/* Shift slots preview */}
      {day.isCurrentMonth && shiftGroups.length > 0 && (
        <div className="space-y-0.5">
          {shiftGroups.map(({ shift, slots }) => {
            const cfg = SHIFT_CONFIG[shift];
            return (
              <div key={shift} className="flex items-center gap-0.5">
                <span className="text-[7px] leading-none">{cfg.icon}</span>
                <div className="flex gap-px flex-wrap">
                  {slots.map((slot, i) => {
                    // For count > 1, show multiple dots
                    const dots = [];
                    for (let c = 0; c < slot.count; c++) {
                      dots.push(
                        <span
                          key={`${i}-${c}`}
                          className="inline-block w-1.5 h-1.5 rounded-full opacity-40"
                          style={{ backgroundColor: DEPT_COLORS[slot.dept] || '#9ca3af' }}
                          title={`${slot.dept}${slot.position ? ' ' + slot.position : ''}`}
                        />
                      );
                    }
                    return dots;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hover hint */}
      {day.isCurrentMonth && totalSlots > 0 && (
        <div className="absolute bottom-0.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[7px] text-gray-400">{filledCount}/{totalSlots}</span>
        </div>
      )}
    </div>
  );
}
