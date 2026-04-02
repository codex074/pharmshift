'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, CalendarDay, Holiday } from '@/lib/types';
import { format } from 'date-fns';
import { buildCalendarWeeks } from '@/lib/calendarMonthGrid';


// Per-weekday header colours (Sun=0 … Sat=6) — matches OfficeCalendarGrid
const DOW_HDR: Record<number, string> = {
  0: 'bg-[#F3828A] text-red-900',
  1: 'bg-[#FEE66A] text-yellow-900',
  2: 'bg-[#FFB1DC] text-pink-900',
  3: 'bg-[#B6E666] text-green-900',
  4: 'bg-[#FEA86F] text-orange-900',
  5: 'bg-[#A1DDFF] text-sky-900',
  6: 'bg-[#D0AEEF] text-purple-900',
};

interface MyCalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[]; // already filtered to only mine
  holidays: Holiday[];
  prevMonthLastDayShifts?: Shift[];
  onDayClick: (day: CalendarDay) => void;
  onShiftClick?: (shift: Shift) => void;
  pendingShiftIds?: Set<string>;
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}

export function MyCalendarGrid({ year, month, shifts, holidays, prevMonthLastDayShifts, onDayClick, onShiftClick, pendingShiftIds }: MyCalendarGridProps) {
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

  const weeks = buildCalendarWeeks(year, month, shifts, holidays, prevMonthLastDayShifts);

  // ── Improvement 1: Stats counts ─────────────────────────────────────
  const chaoCount = shifts.filter(s => s.shift_type === 'เช้า').length;
  const baiCount  = shifts.filter(s => s.shift_type === 'บ่าย').length;
  const duekCount = shifts.filter(s => s.shift_type === 'ดึก').length;
  const rungCount = shifts.filter(s => s.shift_type === 'รุ่งอรุณ').length;

  const statPills = [
    { label: 'รุ่งอรุณ', count: rungCount, color: 'bg-[#FEF3DC] text-amber-900  border border-[#FFCA72]' },
    { label: 'เช้า',     count: chaoCount, color: 'bg-[#E8F9FA] text-teal-900   border border-[#9FDCE0]' },
    { label: 'บ่าย',     count: baiCount,  color: 'bg-[#F3EDF8] text-purple-900 border border-[#9E76B4]' },
    { label: 'ดึก',      count: duekCount, color: 'bg-[#EEF0FF] text-indigo-900 border border-[#99ABFF]' },
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
        <div className="grid grid-cols-7 border-b border-gray-200">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-2 sm:py-3 text-center text-[10px] sm:text-sm font-semibold',
              DOW_HDR[i]
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
                const hasPrevMonthShifts = !day.isCurrentMonth && hasShifts;

                return (
                  <div
                    key={di}
                    onClick={() => day.isCurrentMonth ? onDayClick(day) : undefined}
                    className={cn(
                      'min-h-[72px] sm:min-h-[120px] p-1 sm:p-2 border-r border-gray-200 last:border-r-0 relative transition-colors',
                      !day.isCurrentMonth && !hasPrevMonthShifts && 'bg-gray-50/50 text-gray-400',
                      hasPrevMonthShifts && 'bg-white opacity-40 pointer-events-none',
                      day.isCurrentMonth && 'hover:bg-purple-50/40 cursor-pointer text-gray-700',
                      day.isToday && 'bg-pink-50/60 ring-[3px] ring-pink-300 [.exporting-pdf_&]:ring-0 ring-inset z-20'
                    )}
                  >
                    {/* Day Number */}
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className={cn(
                        'text-xs sm:text-base font-medium w-6 h-6 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shrink-0',
                        day.isToday && 'bg-pink-400 text-white shadow-sm',
                        !day.isToday && isWeekend && day.isCurrentMonth && 'text-red-500'
                      )}>
                        {dayNum}
                      </span>
                      {hasShifts && (
                        <span className="text-[8px] sm:text-[10px] font-medium text-purple-500 bg-purple-100 px-0.5 sm:px-1.5 py-0.5 rounded-full leading-none">
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
                        } else if (shift.shift_type === 'ดึก') {
                          mobileLabel = 'ดึก';
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

                                        // Colors matching the main CalendarGrid (SHIFT_HDR / CELL_BG)
                        const pillStyle =
                          shift.shift_type === 'เช้า'     ? 'bg-[#E8F9FA] border-[#9FDCE0] text-teal-900   hover:bg-[#c8eef1]' :
                          shift.shift_type === 'บ่าย'     ? 'bg-[#F3EDF8] border-[#9E76B4] text-purple-900 hover:bg-[#e3d5f0]' :
                          shift.shift_type === 'ดึก'      ? 'bg-[#EEF0FF] border-[#99ABFF] text-indigo-900 hover:bg-[#d8dcff]' :
                          shift.shift_type === 'รุ่งอรุณ' ? 'bg-[#FEF3DC] border-[#FFCA72] text-amber-900  hover:bg-[#fde8b4]' :
                                                            'bg-violet-100 border-violet-300 text-violet-800 hover:bg-violet-200';

                        return (
                          <div
                            key={i}
                            onClick={onShiftClick ? (e) => { e.stopPropagation(); onShiftClick(shift); } : undefined}
                            className={cn(
                              'relative flex items-center justify-center px-0.5 py-0.5 sm:p-1.5 rounded sm:rounded-lg border sm:border-2 transition-all overflow-hidden [.exporting-pdf_&]:overflow-visible [.exporting-pdf_&]:bg-none [.exporting-pdf_&]:shadow-none',
                              pillStyle,
                              hasPrevMonthShifts && 'opacity-70',
                              onShiftClick && 'cursor-pointer active:scale-95',
                              isPending && 'ring-2 ring-red-400 ring-offset-1',
                            )}
                          >
                            <span className="font-semibold leading-tight text-[9px] truncate sm:hidden">{mobileLabel}</span>
                            <span className="font-semibold leading-tight text-xs truncate hidden sm:block">{shiftLabel}</span>
                            {/* Pending dot */}
                            {isPending && (
                              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full shadow-sm [.exporting-pdf_&]:hidden" />
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
