'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, Holiday, ShiftType } from '@/lib/types';
import { SHIFT_CONFIG, DEPT_COLORS } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronRight } from 'lucide-react';

interface MobileCalendarListProps {
  year: number;
  month: number;
  shifts: Shift[];
  holidays: Holiday[];
  currentUser?: User | null;
  onShiftClick?: (shift: Shift) => void;
}

function buildDays(year: number, month: number, shifts: Shift[], holidays: Holiday[]): CalendarDay[] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });

  const days: CalendarDay[] = [];
  let current = calStart;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (current <= monthEnd || days.length % 7 !== 0) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const isHoliday = holidays.some(h => h.date === dateStr);

    if (current.getMonth() === month - 1) {
      days.push({
        date: new Date(current),
        shifts: dayShifts,
        isCurrentMonth: true,
        isToday: current.getTime() === today.getTime(),
        isHoliday,
      });
    }

    current = addDays(current, 1);
    if (current > monthEnd && current.getMonth() !== month - 1) break;
  }

  return days;
}

function getUserName(shift: Shift): string {
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.name || (shift as any).user_name || '';
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}

const SHIFT_ORDER: ShiftType[] = ['เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ'];

export function MobileCalendarList({
  year, month, shifts, holidays, currentUser, onShiftClick,
}: MobileCalendarListProps) {
  const days = buildDays(year, month, shifts, holidays);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [year, month]);

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const dow = day.date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const dayName = THAI_DAYS[dow];
        const dayNum = format(day.date, 'd');
        const hasShifts = day.shifts.length > 0;

        // Group shifts by type
        const shiftsByType = SHIFT_ORDER.map(type => ({
          type,
          config: SHIFT_CONFIG[type],
          shifts: day.shifts.filter(s => s.shift_type === type),
        })).filter(g => g.shifts.length > 0);

        return (
          <div
            key={format(day.date, 'yyyy-MM-dd')}
            ref={day.isToday ? todayRef : undefined}
            className={cn(
              'rounded-xl border bg-white shadow-sm overflow-hidden transition-all',
              day.isToday && 'ring-2 ring-violet-500 border-violet-300 shadow-violet-100/50',
              day.isHoliday && !day.isToday && 'border-red-200',
              !hasShifts && !day.isToday && 'opacity-60',
            )}
          >
            {/* Day Header */}
            <div className={cn(
              'flex items-center justify-between px-4 py-2.5',
              day.isToday ? 'bg-violet-50' :
              day.isHoliday ? 'bg-red-50/50' :
              isWeekend ? 'bg-gray-50' : 'bg-white',
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg',
                  day.isToday ? 'bg-violet-600 text-white shadow-sm' :
                  dow === 0 || day.isHoliday ? 'bg-red-100 text-red-600' :
                  dow === 6 ? 'bg-indigo-100 text-indigo-600' :
                  'bg-gray-100 text-gray-700',
                )}>
                  {dayNum}
                </div>
                <div>
                  <p className={cn(
                    'text-sm font-semibold',
                    day.isToday ? 'text-violet-700' :
                    dow === 0 || day.isHoliday ? 'text-red-600' :
                    dow === 6 ? 'text-indigo-600' :
                    'text-gray-700',
                  )}>
                    {dayName}
                    {day.isToday && <span className="ml-1.5 text-xs font-medium bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded-full">วันนี้</span>}
                  </p>
                  {day.isHoliday && (
                    <p className="text-[10px] text-red-500 font-medium">วันหยุดราชการ</p>
                  )}
                </div>
              </div>
              {hasShifts && (
                <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                  {day.shifts.length} เวร
                </span>
              )}
            </div>

            {/* Shifts by Type */}
            {shiftsByType.length > 0 && (
              <div className="divide-y divide-gray-100">
                {shiftsByType.map(({ type, config, shifts: typeShifts }) => (
                  <div key={type}>
                    {/* Shift Type Header */}
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50/50">
                      <span className="text-xs">{config.icon}</span>
                      <span className="text-[11px] font-semibold text-gray-500">{config.label}</span>
                      <span className="text-[10px] text-gray-400">({config.time})</span>
                    </div>

                    {/* Individual Shifts */}
                    {typeShifts.map((shift) => {
                      const isMe = currentUser && shift.user_id === currentUser.id;
                      const deptName = getDeptName(shift);
                      const deptColor = DEPT_COLORS[deptName as keyof typeof DEPT_COLORS] || '#9ca3af';
                      const userName = getUserName(shift);
                      const position = (shift as any).position;

                      return (
                        <button
                          key={shift.id}
                          onClick={() => onShiftClick?.(shift)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left',
                            isMe
                              ? 'bg-violet-50/70 hover:bg-violet-100/70 active:bg-violet-100'
                              : 'hover:bg-gray-50 active:bg-gray-100',
                          )}
                        >
                          {/* Dept color dot */}
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: deptColor }}
                          />

                          {/* Dept badge */}
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 min-w-[3rem] text-center"
                            style={{
                              backgroundColor: deptColor + '18',
                              color: deptColor,
                            }}
                          >
                            {deptName}
                            {position ? ` ${position}` : ''}
                          </span>

                          {/* User name */}
                          <span className={cn(
                            'flex-1 text-sm truncate',
                            isMe ? 'font-bold text-violet-700' : 'text-gray-700',
                          )}>
                            {isMe && '★ '}
                            {userName}
                          </span>

                          {/* Arrow */}
                          <ChevronRight className={cn(
                            'w-4 h-4 flex-shrink-0',
                            isMe ? 'text-violet-400' : 'text-gray-300',
                          )} />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Empty day */}
            {!hasShifts && (
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-400">ไม่มีเวร</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
