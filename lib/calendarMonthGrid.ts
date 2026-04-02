import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import type { CalendarDay, Holiday, Shift } from './types';

function groupShiftsByDate(shifts: Shift[]): Map<string, Shift[]> {
  const grouped = new Map<string, Shift[]>();

  for (const shift of shifts) {
    const existing = grouped.get(shift.date);
    if (existing) {
      existing.push(shift);
      continue;
    }
    grouped.set(shift.date, [shift]);
  }

  return grouped;
}

export function getPreviousMonthLastDay(year: number, month: number): Date {
  return new Date(year, month - 1, 0);
}

export function buildCalendarWeeks(
  year: number,
  month: number,
  shifts: Shift[],
  holidays: Holiday[],
  prevMonthLastDayShifts: Shift[] = [],
): CalendarDay[][] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  let gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  if (monthStart.getDay() === 0 && prevMonthLastDayShifts.length > 0) {
    gridStart = addDays(gridStart, -7);
  }

  const prevMonthLastDay = getPreviousMonthLastDay(year, month);
  const prevMonthLastDayStr = format(prevMonthLastDay, 'yyyy-MM-dd');
  const currentShiftsByDate = groupShiftsByDate(shifts);
  const prevDayShifts = prevMonthLastDayShifts.filter((shift) => shift.date === prevMonthLastDayStr);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isCurrentMonth = isSameMonth(date, monthStart);
    const isPrevMonthLastDay = !isCurrentMonth && dateStr === prevMonthLastDayStr;

    return {
      date,
      shifts: isCurrentMonth ? (currentShiftsByDate.get(dateStr) ?? []) : (isPrevMonthLastDay ? prevDayShifts : []),
      isCurrentMonth,
      isToday: date.getTime() === today.getTime(),
      isHoliday: holidays.some((holiday) => holiday.date === dateStr),
    };
  });

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

export function buildCalendarDays(
  year: number,
  month: number,
  shifts: Shift[],
  holidays: Holiday[],
  prevMonthLastDayShifts: Shift[] = [],
): CalendarDay[] {
  return buildCalendarWeeks(year, month, shifts, holidays, prevMonthLastDayShifts).flat();
}
