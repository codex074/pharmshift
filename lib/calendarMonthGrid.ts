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
  // Shifts for days just outside the month (either month) — rendered faded to complete the leading/trailing weeks.
  surroundingShifts: Shift[] = [],
): CalendarDay[][] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  let gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const currentShiftsByDate = groupShiftsByDate(shifts);
  const surroundingShiftsByDate = groupShiftsByDate(surroundingShifts);

  // When the month starts on Sunday there are no leading overflow days in the
  // standard grid — prepend the previous week so its shifts (e.g. an overnight
  // ดึก bleeding into day 1) still get shown, but only if there's real data there.
  if (monthStart.getDay() === 0) {
    const extendedStart = addDays(gridStart, -7);
    const hasLeadingWeekShifts = eachDayOfInterval({ start: extendedStart, end: addDays(gridStart, -1) })
      .some((date) => surroundingShiftsByDate.has(format(date, 'yyyy-MM-dd')));
    if (hasLeadingWeekShifts) gridStart = extendedStart;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isCurrentMonth = isSameMonth(date, monthStart);

    return {
      date,
      shifts: isCurrentMonth ? (currentShiftsByDate.get(dateStr) ?? []) : (surroundingShiftsByDate.get(dateStr) ?? []),
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
  surroundingShifts: Shift[] = [],
): CalendarDay[] {
  return buildCalendarWeeks(year, month, shifts, holidays, surroundingShifts).flat();
}
