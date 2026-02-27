'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';

const cellStyle = "border-r border-b border-gray-400/50 flex items-center justify-center p-0.5 text-[10px] sm:text-[11px] font-medium";
const headerStyle = "bg-gray-200/60 font-bold border-r border-b border-gray-400/60 flex items-center justify-center text-[10px] sm:text-[11px] truncate tracking-tight";
const nameCellStyle = "bg-white hover:bg-violet-50/40 cursor-pointer overflow-hidden leading-tight border-b border-r border-gray-400/50 flex flex-wrap items-center justify-center p-0.5 min-h-[1.5rem] relative";

interface CalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  currentUser?: User | null;
  onDayClick: (day: CalendarDay) => void;
  viewMode: 'all' | 'mine';
}

function buildWeeks(year: number, month: number, shifts: Shift[]): CalendarDay[][] {
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

    weeks[weeks.length - 1].push({
      date: new Date(current),
      shifts: dayShifts,
      isCurrentMonth: current.getMonth() === month - 1,
      isToday: current.getTime() === today.getTime(),
    });

    current = addDays(current, 1);
    if (weeks[weeks.length - 1].length === 7 && current > monthEnd) break;
  }

  return weeks;
}

export function OfficeCalendarGrid({ year, month, shifts, currentUser, onDayClick, viewMode }: CalendarGridProps) {
  const weeks = buildWeeks(year, month, shifts);

  return (
    <div className="w-full overflow-x-auto border-t-2 border-l-2 border-gray-400/60 shadow-sm bg-white">
      <div className="min-w-[1000px] select-none">
        
        {/* Header Row */}
        <div className="grid grid-cols-7 border-b-2 border-gray-400/60">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-1.5 text-center text-xs font-bold border-r-2 border-gray-400/60',
              i === 0 ? 'text-red-600' : i === 6 ? 'text-indigo-600' : 'text-gray-800'
            )}>
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b-2 border-gray-400/60 h-auto">
            {week.map((day, di) => {
              if (!day.isCurrentMonth) {
                return <div key={di} className="border-r-2 border-gray-400/60 bg-gray-100/50" />;
              }
              const dow = day.date.getDay();

              return (
                <div key={di} className={cn('border-r-2 border-gray-400/60 relative', day.isToday && 'ring-2 ring-violet-500 ring-inset z-10')}>
                  <DayGrid day={day} currentUser={currentUser} onDayClick={onDayClick} />
                </div>
              );
            })}
          </div>
        ))}

      </div>
    </div>
  );
}

// ─── UTILS ──────────────────────────────────────────────────────────

function getUserName(shift: Shift): string {
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.name || (shift as any).user_name || '';
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}

function renderNames(shifts: Shift[], shiftType: ShiftType, deptName?: string, currentUser?: User | null) {
  const matching = shifts.filter(s => 
    s.shift_type === shiftType && 
    (!deptName || getDeptName(s) === deptName)
  );
  
  if (matching.length === 0) return null;

  return matching.map((s, i) => {
    const isMe = currentUser && s.user_id === currentUser.id;
    return (
      <span key={i} className={cn('block text-center text-[10px] w-full', isMe ? 'text-violet-700 font-bold bg-violet-100/50 px-0.5 rounded-sm' : 'text-slate-800')}>
        {getUserName(s)}
      </span>
    );
  });
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function DayGrid({ day, currentUser, onDayClick }: { day: CalendarDay, currentUser?: User | null, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dow = day.date.getDay();
  const isWeekend = dow === 0 || dow === 6;

  if (isWeekend) {
    return (
      <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.25fr_1.25fr] grid-rows-[repeat(5,_minmax(1.75rem,_auto))] h-full" onClick={() => onDayClick(day)}>
        <div className={headerStyle} style={{ gridArea: '1 / 1 / 2 / 5' }}></div>
        <div className={cn(headerStyle, dow === 0 ? 'text-red-500' : 'text-indigo-600', 'text-sm')} style={{ gridArea: '1 / 5 / 2 / 6' }}>{dayNum}</div>

        <div className={headerStyle} style={{ gridArea: '2 / 1 / 3 / 2' }}>คพ</div>
        <div className={headerStyle} style={{ gridArea: '2 / 2 / 3 / 3' }}>Surg</div>
        <div className={headerStyle} style={{ gridArea: '2 / 3 / 3 / 4' }}>MED</div>
        <div className={cn(headerStyle, 'bg-[#ffffff] px-0')} style={{ gridArea: '2 / 4 / 3 / 5' }}>บ่ายMED</div>
        <div className={cn(headerStyle, 'bg-[#ffffff] px-0')} style={{ gridArea: '2 / 5 / 3 / 6' }}>บ่ายER</div>

        <div className={cn(nameCellStyle, 'bg-[#bbf7d0] hover:bg-[#86efac]')} style={{ gridArea: '3 / 1 / 6 / 2' }}>
          {renderNames(day.shifts, 'เช้า', 'โครงการ', currentUser)}
          {renderNames(day.shifts, 'เช้า', 'ER', currentUser)}
        </div>
        <div className={cn(nameCellStyle, 'bg-[#a5f3fc] hover:bg-[#67e8f9]')} style={{ gridArea: '3 / 2 / 6 / 3' }}>{renderNames(day.shifts, 'เช้า', 'SURG', currentUser)}</div>
        <div className={cn(nameCellStyle, 'bg-[#fef08a] hover:bg-[#fde047]')} style={{ gridArea: '3 / 3 / 6 / 4' }}>{renderNames(day.shifts, 'เช้า', 'MED', currentUser)}</div>
        <div className={nameCellStyle} style={{ gridArea: '3 / 4 / 5 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', currentUser)}</div>
        <div className={nameCellStyle} style={{ gridArea: '3 / 5 / 5 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'ER', currentUser)}</div>

        <div className={cn(headerStyle, 'bg-[#ffffff] py-0.5 border-t-0')} style={{ gridArea: '5 / 4 / 6 / 5' }}>ดึก</div>
        <div className={nameCellStyle} style={{ gridArea: '5 / 5 / 6 / 6' }}>{renderNames(day.shifts, 'ดึก', 'ER', currentUser)}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[2fr_1fr_1fr] grid-rows-[repeat(5,_minmax(1.75rem,_auto))] h-full" onClick={() => onDayClick(day)}>
      <div className={headerStyle} style={{ gridArea: '1 / 1 / 2 / 3' }}></div>
      <div className={cn(headerStyle, 'text-gray-900 text-sm')} style={{ gridArea: '1 / 3 / 2 / 4' }}>{dayNum}</div>

      <div className={cn(headerStyle, 'bg-[#ffffff]')} style={{ gridArea: '2 / 1 / 3 / 2' }}>คพ</div>
      <div className={cn(headerStyle, 'bg-[#ffffff]')} style={{ gridArea: '2 / 2 / 3 / 3' }}>บ่ายMED</div>
      <div className={cn(headerStyle, 'bg-[#ffffff]')} style={{ gridArea: '2 / 3 / 3 / 4' }}>บ่ายER</div>

      <div className={nameCellStyle} style={{ gridArea: '3 / 1 / 5 / 2' }}>
        {renderNames(day.shifts, 'เช้า', 'โครงการ', currentUser)}
        {renderNames(day.shifts, 'เช้า', 'MED', currentUser)}
        {renderNames(day.shifts, 'รุ่งอรุณ', 'รุ่งอรุณ', currentUser)}
      </div>
      <div className={nameCellStyle} style={{ gridArea: '3 / 2 / 5 / 3' }}>{renderNames(day.shifts, 'บ่าย', 'MED', currentUser)}</div>
      <div className={nameCellStyle} style={{ gridArea: '3 / 3 / 5 / 4' }}>{renderNames(day.shifts, 'บ่าย', 'ER', currentUser)}</div>

      <div className={cn(headerStyle, 'bg-[#ffffff] py-0.5')} style={{ gridArea: '5 / 1 / 6 / 2' }}>Ext/SMC</div>
      <div className={nameCellStyle} style={{ gridArea: '5 / 2 / 6 / 4' }}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-bold text-[10px] text-gray-800 bg-white/50 z-0">ดึก</div>
        <div className="relative z-10 w-full flex flex-wrap justify-center items-center">
          {renderNames(day.shifts, 'ดึก', 'ER', currentUser)}
        </div>
      </div>
    </div>
  );
}
