import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import type { CalendarDay, Shift } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Build a 6-week calendar grid (42 days) for a given month.
 */
export function buildCalendarDays(year: number, month: number, shifts: Shift[]): CalendarDay[] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd   = endOfMonth(monthStart);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return days.map((date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return {
      date,
      shifts: shifts.filter((s) => s.date === dateStr),
      isCurrentMonth: isSameMonth(date, monthStart),
      isToday: isToday(date),
    };
  });
}

/** Thai month names */
export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/** Format a month header like "มีนาคม 2569" (Buddhist era) */
export function formatThaiMonth(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

/** Map JS Date month to Buddhist era string "YYYY-MM" */
export function toMonthYear(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Determine avatar initials from a name */
export function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
