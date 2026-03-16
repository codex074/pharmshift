'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType, Holiday } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';
import type { PendingAdd, AddShiftContext } from './AdminAddShiftModal';

const cellStyle = "border-r border-b border-gray-400/50 flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium";
const headerStyle = "bg-gray-200/60 font-bold border-gray-400/60 flex items-center justify-center text-[10px] sm:text-[11px] xl:text-xs truncate tracking-tight";
const nameCellStyle = "bg-white hover:bg-violet-50/40 cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible leading-tight flex flex-wrap content-center items-center justify-center h-full w-full p-0 [.exporting-pdf_&]:min-h-0 [.exporting-pdf_&]:p-0";
const nameTextStyle = "block text-center text-[11px] xl:text-xs w-full px-0.5 leading-[1.1] [.exporting-pdf_&]:leading-[1.05] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px]";

interface CalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  holidays: Holiday[];
  currentUser?: User | null;
  onDayClick: (day: CalendarDay) => void;
  onShiftClick?: (shift: Shift) => void;
  viewMode: 'all' | 'mine';
  isEditMode?: boolean;
  pendingDeletes?: Set<string>;
  pendingEdits?: Record<string, User>;
  onToggleDelete?: (id: string) => void;
  onEditShift?: (shift: Shift) => void;
  pendingAdds?: PendingAdd[];
  onAddShift?: (ctx: AddShiftContext) => void;
  onRemovePendingAdd?: (index: number) => void;
}

function buildWeeks(year: number, month: number, shifts: Shift[], holidays: Holiday[]): CalendarDay[][] {
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
    const isHoliday = holidays.some(h => h.date === dateStr);

    weeks[weeks.length - 1].push({
      date: new Date(current),
      shifts: dayShifts,
      isCurrentMonth: current.getMonth() === month - 1,
      isToday: current.getTime() === today.getTime(),
      isHoliday,
    });

    current = addDays(current, 1);
    if (weeks[weeks.length - 1].length === 7 && current > monthEnd) break;
  }

  return weeks;
}

export function PharmacyTechCalendarGrid({ 
  year, month, shifts, holidays, currentUser, onDayClick, onShiftClick, viewMode,
  isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift,
  pendingAdds, onAddShift, onRemovePendingAdd
}: CalendarGridProps) {
  const weeks = buildWeeks(year, month, shifts, holidays);

  const ctx: RenderContext = { currentUser, isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift, onShiftClick, pendingAdds, onAddShift, onRemovePendingAdd };

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
                  {day.isToday && <div className="absolute inset-0 border-4 border-red-500 z-50 pointer-events-none [.exporting-pdf_&]:hidden" />}
                  <DayGrid day={day} onDayClick={onDayClick} ctx={ctx} />
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

interface RenderContext {
  currentUser?: User | null;
  isEditMode?: boolean;
  pendingDeletes?: Set<string>;
  pendingEdits?: Record<string, User>;
  onToggleDelete?: (id: string) => void;
  onEditShift?: (s: Shift) => void;
  onShiftClick?: (shift: Shift) => void;
  pendingAdds?: PendingAdd[];
  onAddShift?: (ctx: AddShiftContext) => void;
  onRemovePendingAdd?: (index: number) => void;
}

function renderShiftBadge(s: Shift, ctx: RenderContext) {
  const isMe = ctx.currentUser && s.user_id === ctx.currentUser.id;
  const isPendingDelete = ctx.pendingDeletes?.has(s.id);
  const pendingSub = ctx.pendingEdits?.[s.id];
  
  const displayName = pendingSub ? pendingSub.name : getUserName(s);

  if (ctx.isEditMode) {
    return (
      <div 
        key={s.id} 
        className={cn(
          "flex items-center justify-between w-full px-1 py-0.5 rounded border my-0.5",
          isPendingDelete ? "bg-red-50 border-red-200" : pendingSub ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200 hover:border-gray-300 pointer-events-auto"
        )}
        onClick={(e) => { e.stopPropagation(); if (ctx.onEditShift) ctx.onEditShift(s); }}
      >
        <span className={cn("text-[10px] truncate flex-1 leading-tight", isPendingDelete && "line-through text-red-400", pendingSub && "text-indigo-700 font-bold")}>
          {displayName}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); if (ctx.onToggleDelete) ctx.onToggleDelete(s.id); }}
          className="w-3 h-3 ml-1 shrink-0 rounded flex items-center justify-center border border-gray-300 bg-white"
        >
          {isPendingDelete && <div className="w-1.5 h-1.5 bg-red-500 rounded-sm" />}
        </button>
      </div>
    );
  }

  return (
    <span
      key={s.id}
      className={cn(nameTextStyle, isMe ? 'text-violet-700 font-bold bg-violet-100/50 rounded-sm cursor-pointer hover:ring-2 hover:ring-violet-400 hover:bg-violet-100' : 'text-slate-800 cursor-pointer hover:ring-2 hover:ring-blue-300 hover:bg-blue-50')}
      onClick={(e) => { e.stopPropagation(); ctx.onShiftClick?.(s); }}
    >
      {displayName}
    </span>
  );
}

function renderNames(shifts: Shift[], shiftType: ShiftType, deptName: string | undefined, ctx: RenderContext) {
  const matching = shifts.filter(s => 
    s.shift_type === shiftType && 
    (!deptName || getDeptName(s) === deptName)
  );
  
    if (matching.length === 0) return null;

  return matching.map((s) => renderShiftBadge(s, ctx));
}

function SlotContainer({ shifts, shiftType, deptName, count, ctx, bgColor, hoverColor, hideInnerBorders, dateStr }: { shifts: Shift[], shiftType: ShiftType, count: number, deptName?: string, ctx: RenderContext, bgColor: string, hoverColor: string, hideInnerBorders?: boolean, dateStr?: string }) {
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
  
  // Get pending adds for this cell
  const cellPendingAdds = dateStr && ctx.pendingAdds ? ctx.pendingAdds.filter(
    (add, _) => add.date === dateStr && add.shift_type === shiftType && (!deptName || add.department === deptName)
  ) : [];

  const slots = Array.from({ length: Math.max(count, matching.length + cellPendingAdds.length) });
  // Only show add button if there are empty slots remaining
  const totalOccupied = matching.length + cellPendingAdds.length;
  return (
    <div className="flex flex-col h-full w-full">
      {slots.map((_, i) => {
        const s = matching[i];
        // Check if this slot should show a pending add
        const pendingIdx = i - matching.length;
        const pendingAdd = pendingIdx >= 0 && pendingIdx < cellPendingAdds.length ? cellPendingAdds[pendingIdx] : null;
        const globalPendingIdx = pendingAdd && ctx.pendingAdds ? ctx.pendingAdds.indexOf(pendingAdd) : -1;
        
        return (
          <div key={i} className={cn(
            "flex-1 border-b border-gray-400/60 flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 overflow-hidden [.exporting-pdf_&]:overflow-visible min-h-[1.5rem]",
            bgColor, `hover:${hoverColor}`,
            (hideInnerBorders || i === slots.length - 1) ? "border-b-0" : ""
          )}>
            {s && renderShiftBadge(s, ctx)}
            {pendingAdd && (
              <div className="flex items-center justify-between w-full px-1 py-0.5 rounded border my-0.5 bg-green-50 border-green-300 pointer-events-auto">
                <span className="text-[10px] truncate flex-1 leading-tight text-green-800 font-bold">
                  {pendingAdd.user.nickname || pendingAdd.user.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); ctx.onRemovePendingAdd?.(globalPendingIdx); }}
                  className="w-3 h-3 ml-1 shrink-0 rounded flex items-center justify-center text-red-500 hover:text-red-700 font-bold text-[10px] leading-none"
                >
                  ×
                </button>
              </div>
            )}
            {!s && !pendingAdd && ctx.isEditMode && ctx.onAddShift && dateStr && deptName && i < count && totalOccupied < count && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onAddShift!({ date: dateStr, shift_type: shiftType, department: deptName, position: '' });
                }}
                className="w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 text-green-700 hover:text-green-900 flex items-center justify-center text-base font-bold transition-all pointer-events-auto border border-green-300 shadow-[0_2px_0_0_rgba(34,197,94,1)] active:shadow-[0_0_0_0_rgba(34,197,94,1)] active:translate-y-[2px] -translate-y-[1px]"
                title="เพิ่มเวร"
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function DayGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const dow = day.date.getDay();
  const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;

  // Render internal borders manually in the flex layout
  if (isWeekendOrHoliday) {
    return (
      <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>
        {/* Row 1: Date Header */}
        <div className="flex border-b-2 border-gray-400/60 h-6">
          <div className="w-[50%] border-r border-gray-400/60 bg-gray-200/60"></div>
          <div className={cn("w-[50%] flex items-center justify-center font-bold text-sm bg-gray-200/60", (dow === 0 || day.isHoliday) ? 'text-red-500' : 'text-indigo-600')}>{dayNum}</div>
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
                  <SlotContainer shifts={day.shifts} shiftType="เช้า" count={2} deptName="SURG" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} dateStr={dateStr} />
                </div>
              </div>
              {/* ER (1 slot, h-40%) */}
              <div className="h-[40%] flex flex-col">
                <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">ER</div>
                <div className="flex-1">
                  <SlotContainer shifts={day.shifts} shiftType="เช้า" deptName="ER" count={1} ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
                </div>
              </div>
            </div>
            {/* MED Column (3 slots, w-50%) */}
            <div className="w-[50%] flex flex-col">
              <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">MED</div>
              <div className="flex-1">
                <SlotContainer shifts={day.shifts} shiftType="เช้า" count={3} deptName="MED" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} dateStr={dateStr} />
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
                  <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={2} deptName="MED" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} dateStr={dateStr} />
                </div>
              </div>
              {/* บ่ายER (1 slot => relative to its h-60%, meaning it's 100% of this tall container) */}
              <div className="w-[50%] flex flex-col">
                <div className="h-6 border-b border-gray-400/60 bg-[#fffbeb] text-amber-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">บ่ายER</div>
                <div className="flex-1">
                  <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={1} deptName="ER" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
                </div>
              </div>
            </div>
            {/* Bottom part: ดึก (h-40% so it perfectly aligns with the bottom of MED) */}
            <div className="h-[40%] flex flex-col">
              <div className="h-6 border-b border-gray-400/60 bg-[#e0e7ff] text-indigo-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">ดึก</div>
              <div className="flex-1 bg-white">
                <SlotContainer shifts={day.shifts} shiftType="ดึก" count={1} deptName="ER" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
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
              <SlotContainer shifts={day.shifts} shiftType="รุ่งอรุณ" deptName="รุ่งอรุณ" count={rungAroonSlots} ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
            </div>
          </div>
          {/* smc - 2 slots (h-40%) */}
          <div className="h-[40%] flex flex-col">
            <div className="h-6 border-b border-gray-400/60 bg-gray-200/60 text-gray-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">smc</div>
            <div className="flex-1">
               <SlotContainer shifts={day.shifts} shiftType="บ่าย" deptName="SMC" count={2} ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
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
                <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={2} deptName="MED" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" hideInnerBorders={true} dateStr={dateStr} />
              </div>
            </div>
            {/* บ่ายER */}
            <div className="w-[50%] flex flex-col">
              <div className="h-6 border-b border-gray-400/60 bg-[#fffbeb] text-amber-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">บ่ายER</div>
              <div className="flex-1">
                <SlotContainer shifts={day.shifts} shiftType="บ่าย" count={1} deptName="ER" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
              </div>
            </div>
          </div>
          {/* Bottom part: ดึก (h-40%) */}
          <div className="h-[40%] flex flex-col">
            <div className="h-6 border-b border-gray-400/60 bg-[#e0e7ff] text-indigo-800 font-bold text-[11px] xl:text-xs flex items-center justify-center">ดึก</div>
            <div className="flex-1 bg-white">
              <SlotContainer shifts={day.shifts} shiftType="ดึก" count={1} deptName="ER" ctx={ctx} bgColor="bg-white" hoverColor="bg-violet-50/40" dateStr={dateStr} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
