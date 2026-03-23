import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import type { CalendarDay, Shift, ShiftType } from './types';

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

// ─── Shift Overlap Detection ─────────────────────────────────────────────────

/**
 * Time ranges in minutes used for same-date overlap detection.
 *
 * Convention for เวรดึก:
 *   ดึก is recorded under the date the night BEGINS (e.g., ดึก 27/3 = คืน 27/3 → ออกเช้า 28/3).
 *   It actually runs from midnight (24:00 of that date) to 08:30 the next morning.
 *   We model this as start = 1440 (24 * 60) so it lies AFTER all same-date shifts end,
 *   preventing false collisions with เช้า / บ่าย / รุ่งอรุณ / smc on the same date.
 *
 * Overlap check uses strict inequality: touching endpoints (e.g., 08:30–08:30) = no conflict.
 */
const SHIFT_MINUTES: Record<ShiftType, { start: number; end: number }> = {
  'เช้า':    { start:  8 * 60 + 30, end: 16 * 60 + 30 },  //  510 –  990
  'บ่าย':    { start: 16 * 60 + 30, end: 23 * 60 + 59 },  //  990 – 1439
  'ดึก':     { start: 24 * 60,      end: 32 * 60 + 30 },  // 1440 – 1950  (คืนวันนั้น → เช้าวันถัดไป)
  'รุ่งอรุณ': { start:  7 * 60,      end:  8 * 60 + 30 },  //  420 –  510
  'smc':     { start: 16 * 60 + 30, end: 20 * 60 + 30 },  //  990 – 1230
};

/**
 * Returns true if shift types a and b overlap in actual clock time.
 * Same type always returns true. Uses strict overlap (touching endpoints = false).
 */
export function shiftsOverlap(a: ShiftType, b: ShiftType): boolean {
  if (a === b) return true;
  const ta = SHIFT_MINUTES[a];
  const tb = SHIFT_MINUTES[b];
  if (!ta || !tb) return false;
  return ta.start < tb.end && tb.start < ta.end;
}

/**
 * From a list of existing shifts, return those that time-overlap with the given shift type.
 * Optionally exclude a specific shift ID (e.g. the shift being replaced).
 */
export function findConflictingShifts(
  existingShifts: Shift[],
  newShiftType: ShiftType,
  excludeShiftId?: string,
): Shift[] {
  return existingShifts.filter(
    s => s.id !== excludeShiftId && shiftsOverlap(s.shift_type as ShiftType, newShiftType),
  );
}

/** Determine avatar initials from a name */
export function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
