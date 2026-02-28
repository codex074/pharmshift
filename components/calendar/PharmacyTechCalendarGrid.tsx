'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';

const cellStyle = "border-r border-b border-gray-400/50 flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium";
const headerStyle = "bg-gray-200/60 font-bold border-gray-400/60 flex items-center justify-center text-[11px] xl:text-xs sm:text-[11px] truncate tracking-tight";
const nameCellStyle = "bg-white hover:bg-violet-50/40 cursor-pointer overflow-hidden leading-tight flex flex-col items-center justify-center p-0";

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

export function PharmacyTechCalendarGrid({ year, month, shifts, currentUser, onDayClick, viewMode }: CalendarGridProps) {
  const weeks = buildWeeks(year, month, shifts);

  return (
    <div className="w-full overflow-x-auto border-t-2 border-l-2 border-gray-400/60 shadow-sm bg-white">
      <div className="min-w-[1240px] select-none">
        
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
                <div key={di} className={cn('border-r-2 border-gray-400/60 relative')}>
                  {day.isToday && <div className="absolute inset-0 border-4 border-red-500 z-50 pointer-events-none" />}
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
      <span key={i} className={cn('block text-center text-[11px] xl:text-xs w-full', isMe ? 'text-violet-700 font-bold bg-violet-100/50 px-0.5 rounded-sm' : 'text-slate-800')}>
        {getUserName(s)}
      </span>
    );
  });
}

function SlotContainer({ shifts, shiftType, deptName, count, currentUser, bgColor, hoverColor, hideInnerBorders }: { shifts: Shift[], shiftType: ShiftType, count: number, deptName?: string, currentUser?: User | null, bgColor: string, hoverColor: string, hideInnerBorders?: boolean }) {
  const matching = shifts.filter(s => 
    s.shift_type === shiftType && 
    (!deptName || getDeptName(s) === deptName)
  );
  
  if (shiftType === 'รุ่งอรุณ') {
    const order: Record<string, number> = { 'OPD': 1, 'ER': 2, 'HIV': 3 };
    matching.sort((a, b) => (order[a.position || ''] || 99) - (order[b.position || ''] || 99));
  } else {
    matching.sort((a, b) => (a.position || '').localeCompare(b.position || '', 'th', { numeric: true }));
  }
  
  const slots = Array.from({ length: count });
  return (
    <div className="flex flex-col h-full w-full">
      {slots.map((_, i) => {
        const s = matching[i];
        const isMe = s && currentUser && s.user_id === currentUser.id;
        return (
          <div key={i} className={cn(
            "flex-1 border-b border-gray-400/60 flex items-center justify-center p-0.5 overflow-hidden min-h-[1.5rem]",
            bgColor, `hover:${hoverColor}`,
            (hideInnerBorders || i === count - 1) ? "border-b-0" : ""
          )}>
            {s && (
              <span className={cn('block text-center text-[11px] xl:text-xs w-full truncate', isMe ? 'text-violet-700 font-bold bg-violet-100/50 px-0.5 rounded-sm' : 'text-slate-800')}>
                {getUserName(s)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function DayGrid({ day, currentUser, onDayClick }: { day: CalendarDay, currentUser?: User | null, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dow = day.date.getDay();
  const isWeekend = dow === 0 || dow === 6;

  // Render internal borders manually in the flex layout
  if (isWeekend) {
    return (
      <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>
        {/* Row 1: Date Header */}
        <div className="flex border-b-2 border-gray-400/60 h-6">
          <div className="w-[50%] border-r border-gray-400/60 bg-gray-200/60"></div>
          <div className={cn("w-[50%] flex items-center justify-center font-bold text-sm bg-gray-200/60", dow === 0 ? 'text-red-500' : 'text-indigo-600')}>{dayNum}</div>
        </div>

        {/* Column Headers + Body Wrapper */}
        <div className="flex flex-1 flex-row relative min-h-[200px]">
          {/* LEFT SECTION (w-50%) */}
          <div className="w-[50%] flex flex-row border-r border-gray-400/60">
            {/* Surg + ER Column (w-50%) */}
            <div className="w-[50%] flex flex-col border-r border-gray-400/60">
              {/* Surg (2 slots, h-60%) */}
              <div className="h-[60%] flex flex-col border-b border-gray-400/60">
                <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">Surg</div>
                <div className="flex-1">
                  <SlotContainer shifts={day.shifts} shiftType="เช้า" count={2} deptName="SURG" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} />
                </div>
              </div>
              {/* ER (1 slot, h-40%) */}
              <div className="h-[40%] flex flex-col">
                <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">ER</div>
                <div className="flex-1">
                  <SlotContainer shifts={day.shifts} shiftType="เช้า" deptName="ER" count={1} currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
                </div>
              </div>
            </div>
            {/* MED Column (3 slots, w-50%) */}
            <div className="w-[50%] flex flex-col">
              <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">MED</div>
              <div className="flex-1">
                <SlotContainer shifts={day.shifts} shiftType="เช้า" count={3} deptName="MED" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} />
              </div>
            </div>
          </div>

          {/* RIGHT SECTION (w-50%) */}
          <div className="w-[50%] flex flex-col">
            {/* Top part: บ่าย (h-60% so ดึก corresponds to the last 40% slot) */}
            <div className="h-[60%] flex flex-row border-b border-gray-400/60">
              {/* บ่ายMED (2 slots => relative to its h-60%, so each is 50%) */}
              <div className="w-[50%] flex flex-col border-r border-gray-400/60">
                <div className="h-6 border-b border-gray-400/60 bg-[#fffbeb] text-amber-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">บ่ายMED</div>
                <div className="flex-1">
                  <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={2} deptName="MED" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} />
                </div>
              </div>
              {/* บ่ายER (1 slot => relative to its h-60%, meaning it's 100% of this tall container) */}
              <div className="w-[50%] flex flex-col">
                <div className="h-6 border-b border-gray-400/60 bg-[#fffbeb] text-amber-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">บ่ายER</div>
                <div className="flex-1">
                  <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={1} deptName="ER" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
                </div>
              </div>
            </div>
            {/* Bottom part: ดึก (h-40% so it perfectly aligns with the bottom of MED) */}
            <div className="h-[40%] flex flex-col">
              <div className="h-6 border-b border-gray-400/60 bg-[#e0e7ff] text-indigo-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">ดึก</div>
              <div className="flex-1 bg-white">
                <SlotContainer shifts={day.shifts} shiftType="ดึก" count={1} deptName="ER" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Monday - Friday layout
  let rungAroonSlots = 2; // Wed, Thu, Fri default
  if (dow === 1) rungAroonSlots = 1; // Mon
  if (dow === 2) rungAroonSlots = 3; // Tue

  return (
    <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>
      {/* Row 1: Date Header */}
      <div className="flex border-b-2 border-gray-400/60 h-6">
        <div className="w-[33.333%] border-r border-gray-400/60 bg-gray-200/60"></div>
        <div className="w-[66.666%] flex items-center justify-center font-bold text-sm bg-gray-200/60 text-gray-900">{dayNum}</div>
      </div>

      {/* Column Headers + Body Wrapper min height to establish proportion */}
      <div className="flex flex-1 flex-row min-h-[200px]">
        {/* LEFT SECTION (w-33.333%) */}
        <div className="w-[33.333%] flex flex-col border-r border-gray-400/60">
          {/* รุ่งอรุณ (h-60%) */}
          <div className="h-[60%] flex flex-col border-b border-gray-400/60">
            <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">รุ่งอรุณ</div>
            <div className="flex-1">
              <SlotContainer shifts={day.shifts} shiftType="รุ่งอรุณ" count={rungAroonSlots} currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
            </div>
          </div>
          {/* smc - 2 slots (h-40%) */}
          <div className="h-[40%] flex flex-col">
            <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">smc</div>
            <div className="flex-1">
               <SlotContainer shifts={day.shifts} shiftType="บ่าย" deptName="SMC" count={2} currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
            </div>
          </div>
        </div>

        {/* RIGHT SECTION (w-66.666%) */}
        <div className="w-[66.666%] flex flex-col">
          {/* Top part: บ่าย (h-60%) */}
          <div className="h-[60%] flex flex-row border-b border-gray-400/60">
            {/* บ่ายMED */}
            <div className="w-[50%] flex flex-col border-r border-gray-400/60">
              <div className="h-6 border-b border-gray-400/60 bg-[#fffbeb] text-amber-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">บ่ายMED</div>
              <div className="flex-1">
                <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={2} deptName="MED" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} />
              </div>
            </div>
            {/* บ่ายER */}
            <div className="w-[50%] flex flex-col">
              <div className="h-6 border-b border-gray-400/60 bg-[#fffbeb] text-amber-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">บ่ายER</div>
              <div className="flex-1">
                <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={1} deptName="ER" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
              </div>
            </div>
          </div>
          {/* Bottom part: ดึก (h-40%) */}
          <div className="h-[40%] flex flex-col">
            <div className="h-6 border-b border-gray-400/60 bg-[#e0e7ff] text-indigo-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">ดึก</div>
            <div className="flex-1 bg-white">
              <SlotContainer shifts={day.shifts} shiftType="ดึก" count={1} deptName="ER" currentUser={currentUser} bgColor="bg-white" hoverColor="bg-violet-50/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
