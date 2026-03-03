'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType, Holiday } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';
import { DEPT_COLORS } from '@/lib/types';

const cellStyle = "border-r border-b border-gray-400/50 flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium";
const headerStyle = "bg-gray-200/60 font-bold border-r border-b border-gray-400/60 flex items-center justify-center text-[10px] sm:text-[11px] xl:text-xs truncate tracking-tight";
const nameCellStyle = "bg-white hover:bg-violet-50/40 cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible leading-tight border-b border-r border-gray-400/50 flex flex-col justify-evenly items-center gap-1 h-full w-full p-1 min-h-[1.95rem] relative";
const nameTextStyle = "block text-center text-[11px] xl:text-xs w-full px-0.5 leading-[1.1] [.exporting-pdf_&]:leading-[1.2] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none";

interface CalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  holidays: Holiday[];
  currentUser?: User | null;
  onDayClick: (day: CalendarDay) => void;
  viewMode: 'all' | 'mine';
  isEditMode?: boolean;
  pendingDeletes?: Set<string>;
  pendingEdits?: Record<string, User>;
  onToggleDelete?: (id: string) => void;
  onEditShift?: (shift: Shift) => void;
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

export function CalendarGrid({ 
  year, month, shifts, holidays, currentUser, onDayClick,
  isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift 
}: CalendarGridProps) {
  const weeks = buildWeeks(year, month, shifts, holidays);

  const ctx: RenderContext = { currentUser, isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift };

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
              const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;

              return (
                <div key={di} className={cn('border-r-2 border-gray-400/60 relative')}>
                  {day.isToday && <div className="absolute inset-0 border-4 border-red-500 z-50 pointer-events-none [.exporting-pdf_&]:hidden" />}
                  { (isWeekendOrHoliday) ? <WeekendGrid day={day} onDayClick={onDayClick} ctx={ctx} /> :
                    (dow === 5) ? <FridayGrid day={day} onDayClick={onDayClick} ctx={ctx} /> :
                    <MonThuGrid day={day} onDayClick={onDayClick} ctx={ctx} />
                  }
                </div>
              );
            })}
          </div>
        ))}

      </div>
    </div>
  );
}

interface RenderContext {
  currentUser?: User | null;
  isEditMode?: boolean;
  pendingDeletes?: Set<string>;
  pendingEdits?: Record<string, User>;
  onToggleDelete?: (id: string) => void;
  onEditShift?: (s: Shift) => void;
}

function getUserName(shift: Shift): string {
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.name || (shift as any).user_name || '';
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
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
          "flex items-center justify-between w-[90%] px-1 py-0.5 rounded border mb-0.5",
          isPendingDelete ? "bg-red-50 border-red-200" : pendingSub ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200 hover:border-gray-300 pointer-events-auto"
        )}
        onClick={(e) => { e.stopPropagation(); if (ctx.onEditShift) ctx.onEditShift(s); }}
      >
        <span className={cn("text-[10px] truncate max-w-[70%]", isPendingDelete && "line-through text-red-400", pendingSub && "text-indigo-700 font-bold")}>
          {displayName}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); if (ctx.onToggleDelete) ctx.onToggleDelete(s.id) }}
          className="w-3 h-3 rounded flex items-center justify-center border border-gray-300 bg-white"
        >
          {isPendingDelete && <div className="w-1.5 h-1.5 bg-red-500 rounded-sm" />}
        </button>
      </div>
    );
  }

  return (
    <span key={s.id} className={cn(nameTextStyle, isMe ? 'text-violet-700 font-bold bg-violet-100/50 rounded-sm' : 'text-slate-800')}>
      {displayName}
    </span>
  );
}

function renderNames(shifts: Shift[], shiftType: ShiftType, deptName: string, ctx: RenderContext, position?: string) {
  const matching = shifts.filter(s =>
    s.shift_type === shiftType &&
    getDeptName(s) === deptName &&
    (!position || (s as any).position === position)
  );
  if (matching.length === 0) return null;

  if (deptName === 'MED' && !position) {
    const posOrder: Record<string, number> = { 'D/C': 0, 'Cont': 1 };
    matching.sort((a, b) => (posOrder[(a as any).position] ?? 99) - (posOrder[(b as any).position] ?? 99));
  }

  return matching.map((s) => renderShiftBadge(s, ctx));
}

function renderPersonalShift(s: Shift | undefined, ctx: RenderContext) {
  if (!s) return null;
  return renderShiftBadge(s, ctx);
}

function renderRungAroonBlocks(day: CalendarDay, ctx: RenderContext) {
  const dow = day.date.getDay();
  let positions = ['OPD'];
  if (dow === 2) positions = ['OPD', 'ER', 'HIV']; // Tue
  else if (dow >= 3 && dow <= 5) positions = ['OPD', 'ER']; // Wed-Fri
  
  return (
    <div className="flex flex-col overflow-hidden [.exporting-pdf_&]:overflow-visible relative" style={{ gridArea: '5 / 1 / 8 / 2' }}>
      {positions.map((pos, idx) => {
        const matchingShifts = day.shifts.filter(s => s.shift_type === 'รุ่งอรุณ' && getDeptName(s) === 'รุ่งอรุณ' && (s as any).position === pos);
        return (
          <div key={idx} className="flex-1 border-r border-b border-gray-400/50 bg-white hover:bg-violet-50/40 cursor-pointer flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 overflow-hidden [.exporting-pdf_&]:overflow-visible gap-1">
            {matchingShifts.map((s, i) => <div key={i}>{renderPersonalShift(s, ctx)}</div>)}
          </div>
        );
      })}
    </div>
  );
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function WeekendGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dow = day.date.getDay();
  const isSundayOrHoliday = dow === 0 || day.isHoliday;

  const chemoShifts = day.shifts.filter(s => s.shift_type === 'เช้า' && getDeptName(s) === 'Chemo');

  return (
    <div className="grid grid-cols-5 grid-rows-[repeat(7,_minmax(2.275rem,_auto))] h-full" onClick={() => onDayClick(day)}>
      
      {/* ROW 1 */}
      <div className={headerStyle} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={headerStyle} style={{ gridArea: '1 / 2 / 2 / 3' }}>SURG</div>
      <div className={headerStyle} style={{ gridArea: '1 / 3 / 2 / 4' }}>MED</div>
      <div className={headerStyle} style={{ gridArea: '1 / 4 / 2 / 5', backgroundColor: '#fffbeb' }}>บ่าย</div>
      <div className={cn(headerStyle, isSundayOrHoliday ? 'text-red-500' : 'text-indigo-600', 'text-sm')} style={{ gridArea: '1 / 5 / 2 / 6' }}>{dayNum}</div>

      {/* ROW 2 & 3 */}
      <div className={nameCellStyle} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'เช้า', 'โครงการ', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '2 / 2 / 4 / 3' }}>{renderNames(day.shifts, 'เช้า', 'SURG', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '2 / 3 / 4 / 4' }}>{renderNames(day.shifts, 'เช้า', 'MED', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '2 / 4 / 3 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '3 / 4 / 4 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx)}</div>

      {/* ROW 4 */}
      <div className={headerStyle} style={{ gridArea: '4 / 1 / 5 / 2' }}>ER</div>
      <div className={headerStyle} style={{ gridArea: '4 / 2 / 5 / 3' }}>Chemo</div>
      <div className={headerStyle} style={{ gridArea: '4 / 3 / 5 / 6', backgroundColor: '#e0e7ff' }}>ดึก</div>

      {/* ROW 5-7 */}
      <div className={nameCellStyle} style={{ gridArea: '5 / 1 / 8 / 2' }}>{renderNames(day.shifts, 'เช้า', 'ER', ctx)}</div>
      
      <div className="grid grid-rows-2" style={{ gridArea: '5 / 2 / 8 / 3' }}>
        <div className="border-r border-b border-gray-400/50 bg-white hover:bg-violet-50/40 cursor-pointer flex items-center justify-center p-0.5 overflow-hidden [.exporting-pdf_&]:overflow-visible">
          {renderPersonalShift(chemoShifts[0], ctx)}
        </div>
        <div className="border-r border-b border-gray-400/50 bg-white hover:bg-violet-50/40 cursor-pointer flex items-center justify-center p-0.5 overflow-hidden [.exporting-pdf_&]:overflow-visible">
          {renderPersonalShift(chemoShifts[1], ctx)}
        </div>
      </div>

      <div className={nameCellStyle} style={{ gridArea: '5 / 3 / 8 / 6' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx)}</div>

    </div>
  );
}

function MonThuGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const smcShifts = day.shifts.filter(s => s.shift_type === 'บ่าย' && getDeptName(s) === 'SMC');

  return (
    <div className="grid grid-cols-4 grid-rows-[repeat(7,_minmax(2.275rem,_auto))] h-full" onClick={() => onDayClick(day)}>
      
      {/* ROW 1 */}
      <div className={headerStyle} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={headerStyle} style={{ gridArea: '1 / 2 / 2 / 3' }}>SMC</div>
      <div className={headerStyle} style={{ gridArea: '1 / 3 / 2 / 4', backgroundColor: '#fffbeb' }}>บ่าย</div>
      <div className={cn(headerStyle, 'text-gray-900 text-sm')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

      {/* ROW 2 & 3 */}
      <div className={nameCellStyle} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '2 / 2 / 3 / 3' }}>{renderPersonalShift(smcShifts[0], ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '3 / 2 / 4 / 3' }}>{renderPersonalShift(smcShifts[1], ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '2 / 3 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '3 / 3 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx)}</div>

      {/* ROW 4 */}
      <div className={headerStyle} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={headerStyle} style={{ gridArea: '4 / 2 / 5 / 5', backgroundColor: '#e0e7ff' }}>ดึก</div>

      {/* ROW 5-7 */}
      {renderRungAroonBlocks(day, ctx)}
      <div className={nameCellStyle} style={{ gridArea: '5 / 2 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx)}</div>

    </div>
  );
}

function FridayGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  return (
    <div className="grid grid-cols-4 grid-rows-[repeat(7,_minmax(2.275rem,_auto))] h-full" onClick={() => onDayClick(day)}>
      
      {/* ROW 1 */}
      <div className={headerStyle} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={headerStyle} style={{ gridArea: '1 / 2 / 2 / 4', backgroundColor: '#fffbeb' }}>บ่าย</div>
      <div className={cn(headerStyle, 'text-gray-900 text-sm')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

      {/* ROW 2 & 3 */}
      <div className={nameCellStyle} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '2 / 2 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx)}</div>
      <div className={nameCellStyle} style={{ gridArea: '3 / 2 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx)}</div>

      {/* ROW 4 */}
      <div className={headerStyle} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={headerStyle} style={{ gridArea: '4 / 2 / 5 / 5', backgroundColor: '#e0e7ff' }}>ดึก</div>

      {/* ROW 5-7 */}
      {renderRungAroonBlocks(day, ctx)}
      <div className={nameCellStyle} style={{ gridArea: '5 / 2 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx)}</div>

    </div>
  );
}
