'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType, Holiday } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';
import { DEPT_COLORS } from '@/lib/types';
import type { PendingAdd, AddShiftContext } from './AdminAddShiftModal';

// ── Shared border / layout helpers ─────────────────────────────────
const BORDER = 'border-gray-300';
const BORDER2 = 'border-slate-400';
const cellStyle = `border-r border-b ${BORDER} flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium`;
const nameTextStyle = "block text-center text-[11px] xl:text-xs w-full px-0.5 leading-[1.1] [.exporting-pdf_&]:leading-[1.05] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px]";

// ── Shift-time colour palettes ─────────────────────────────────
// รุ่งอรุณ  → rose / pink-purple
// เช้า      → amber / warm yellow
// บ่าย      → orange
// ดึก       → indigo / deep blue
const SHIFT_HDR = {
  rung:     'bg-rose-200    text-rose-800   border-rose-300',
  chao:     'bg-emerald-200 text-emerald-900 border-emerald-300',
  bai:      'bg-orange-200  text-orange-900 border-orange-300',
  duek:     'bg-indigo-200  text-indigo-800 border-indigo-300',
  neutral:  'bg-slate-100   text-slate-700  border-slate-200',
} as const;

const CELL_BG = {
  rung:  'bg-rose-50/70     hover:bg-rose-100/80',
  chao:  'bg-emerald-50/70  hover:bg-emerald-100/80',
  bai:   'bg-orange-50/70   hover:bg-orange-100/80',
  duek:  'bg-indigo-50/70   hover:bg-indigo-100/80',
  plain: 'bg-white          hover:bg-slate-50',
} as const;

// Per-weekday header colours (Sun=0 … Sat=6)
const DOW_HDR: Record<number, string> = {
  0: 'bg-red-600     text-white',   // อา.
  1: 'bg-yellow-400  text-gray-900', // จ.
  2: 'bg-pink-600    text-white',   // อ.
  3: 'bg-green-600   text-white',   // พ.
  4: 'bg-orange-500  text-white',   // พฤ.
  5: 'bg-blue-600    text-white',   // ศ.
  6: 'bg-purple-600  text-white',   // ส.
};

function hdr(palette: keyof typeof SHIFT_HDR, extra = '') {
  return cn(`${SHIFT_HDR[palette]} font-bold border-r border-b flex items-center justify-center text-[10px] sm:text-[11px] xl:text-xs truncate tracking-tight`, extra);
}

function nameCell(palette: keyof typeof CELL_BG = 'plain', extra = '') {
  return cn(`${CELL_BG[palette]} cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible leading-tight border-b border-r ${BORDER} flex flex-col justify-evenly items-center gap-1 h-full w-full p-1 min-h-[1.95rem] relative [.exporting-pdf_&]:min-h-0 [.exporting-pdf_&]:p-0.5 [.exporting-pdf_&]:gap-0 [.exporting-pdf_&]:justify-center`, extra);
}

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

export function CalendarGrid({ 
  year, month, shifts, holidays, currentUser, onDayClick, onShiftClick,
  isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift,
  pendingAdds, onAddShift, onRemovePendingAdd
}: CalendarGridProps) {
  const weeks = buildWeeks(year, month, shifts, holidays);

  const ctx: RenderContext = { currentUser, isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift, onShiftClick, pendingAdds, onAddShift, onRemovePendingAdd };

  return (
    <div className="w-full overflow-x-auto border-t-2 border-l-2 border-slate-400 rounded-b-xl shadow-md bg-white">
      <div className="min-w-[1000px] select-none">

        {/* Header Row — day names */}
        <div className="grid grid-cols-7 border-b-2 border-slate-400">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-2 text-center text-sm font-bold border-r-2 border-slate-400',
              DOW_HDR[i]
            )}>
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b-2 border-slate-400 h-auto">
            {week.map((day, di) => {
              if (!day.isCurrentMonth) {
                return <div key={di} className="border-r-2 border-slate-400 bg-gray-50" />;
              }
              const dow = day.date.getDay();
              const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;

              return (
                <div key={di} className={cn(
                  'border-r-2 border-slate-400 relative transition-opacity',
                  day.isToday
                    ? 'bg-amber-50/60 z-10'
                    : 'opacity-50 hover:opacity-80'
                )}>
                  {day.isToday && <div className="absolute inset-0 border-[3px] border-red-500 z-50 pointer-events-none shadow-[inset_0_0_8px_rgba(239,68,68,.25)] [.exporting-pdf_&]:hidden" />}
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
  onShiftClick?: (shift: Shift) => void;
  pendingAdds?: PendingAdd[];
  onAddShift?: (ctx: AddShiftContext) => void;
  onRemovePendingAdd?: (index: number) => void;
}

function getUserName(shift: Shift): string {
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.f_name || (shift as any).user_f_name || '';
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}

function renderShiftBadge(s: Shift, ctx: RenderContext) {
  const isMe = ctx.currentUser && s.user_id === ctx.currentUser.id;
  const isPendingDelete = ctx.pendingDeletes?.has(s.id);
  const pendingSub = ctx.pendingEdits?.[s.id];
  
  const displayName = pendingSub ? (pendingSub.nickname || pendingSub.f_name) : getUserName(s);

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

  /* ── My shift — solid violet pill, star prefix, white text ── */
  if (isMe) {
    return (
      <span
        key={s.id}
        className="block text-center w-full leading-[1.1] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:leading-[1.05] [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px] cursor-pointer"
        onClick={(e) => { e.stopPropagation(); ctx.onShiftClick?.(s); }}
      >
        <span className="inline-flex items-center gap-0.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-bold text-xs rounded-md px-1.5 py-0.5 shadow-md shadow-violet-300/60 transition-colors [.exporting-pdf_&]:bg-violet-100 [.exporting-pdf_&]:text-violet-800 [.exporting-pdf_&]:shadow-none">
          {displayName}
        </span>
      </span>
    );
  }

  /* ── Other people's shifts ── */
  return (
    <span
      key={s.id}
      className={cn(nameTextStyle, 'text-slate-700 cursor-pointer hover:ring-2 hover:ring-blue-300 hover:bg-blue-50 rounded-sm')}
      onClick={(e) => { e.stopPropagation(); ctx.onShiftClick?.(s); }}
    >
      {displayName}
    </span>
  );
}

function renderPendingAddBadge(add: PendingAdd, globalIndex: number, ctx: RenderContext) {
  return (
    <div
      key={`pending-add-${globalIndex}`}
      className="flex items-center justify-between w-[90%] px-1 py-0.5 rounded border mb-0.5 bg-green-50 border-green-300 pointer-events-auto"
    >
      <span className="text-[10px] truncate max-w-[70%] text-green-800 font-bold">
        {add.user.nickname || add.user.f_name}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); ctx.onRemovePendingAdd?.(globalIndex); }}
        className="w-3 h-3 rounded flex items-center justify-center text-red-500 hover:text-red-700 font-bold text-[10px] leading-none"
      >
        ×
      </button>
    </div>
  );
}

function renderAddButton(dateStr: string, shiftType: ShiftType, deptName: string, ctx: RenderContext, position?: string) {
  if (!ctx.isEditMode || !ctx.onAddShift) return null;
  const label = position ? `+${position}` : '+';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        ctx.onAddShift!({ date: dateStr, shift_type: shiftType, department: deptName, position: position || '' });
      }}
      className={cn(
        "bg-green-100 hover:bg-green-200 text-green-700 hover:text-green-900 flex items-center justify-center font-bold transition-all mt-0.5 pointer-events-auto border border-green-300 shadow-[0_2px_0_0_rgba(34,197,94,1)] active:shadow-[0_0_0_0_rgba(34,197,94,1)] active:translate-y-[2px] -translate-y-[1px]",
        position ? "px-1.5 h-6 rounded-lg text-[9px]" : "w-6 h-6 rounded-full text-base"
      )}
      title={`เพิ่มเวร${position ? ` (${position})` : ''}`}
    >
      {label}
    </button>
  );
}

function renderPendingAddsForCell(dateStr: string, shiftType: ShiftType, deptName: string, ctx: RenderContext, position?: string) {
  if (!ctx.pendingAdds) return null;
  return ctx.pendingAdds.map((add, idx) => {
    if (add.date === dateStr && add.shift_type === shiftType && add.department === deptName && (add.position || '') === (position || '')) {
      return renderPendingAddBadge(add, idx, ctx);
    }
    return null;
  });
}

function renderNames(shifts: Shift[], shiftType: ShiftType, deptName: string, ctx: RenderContext, position?: string, dateStr?: string) {
  const matching = shifts.filter(s =>
    s.shift_type === shiftType &&
    getDeptName(s) === deptName &&
    (!position || (s as any).position === position)
  );

  if (deptName === 'MED' && shiftType === 'เช้า' && !position) {
    const posOrder: Record<string, number> = { 'D/C': 0, 'Cont': 1 };
    matching.sort((a, b) => (posOrder[(a as any).position] ?? 99) - (posOrder[(b as any).position] ?? 99));
  }

  const badges = matching.map((s) => renderShiftBadge(s, ctx));
  const pendingBadges = dateStr ? renderPendingAddsForCell(dateStr, shiftType, deptName, ctx, position) : null;
  const hasPendingAdds = pendingBadges?.some(Boolean);

  // Only show + button when there are NO existing shifts and NO pending adds
  let addBtn: React.ReactNode = null;
  if (dateStr && matching.length === 0 && !hasPendingAdds) {
    // For morning MED without specific position: show D/C and Cont buttons
    if (deptName === 'MED' && shiftType === 'เช้า' && !position) {
      addBtn = (
        <div className="flex flex-col gap-1 mt-0.5">
          {renderAddButton(dateStr, shiftType, deptName, ctx, 'D/C')}
          {renderAddButton(dateStr, shiftType, deptName, ctx, 'Cont')}
        </div>
      );
    } else {
      addBtn = renderAddButton(dateStr, shiftType, deptName, ctx, position);
    }
  }

  if (badges.length === 0 && !hasPendingAdds && !addBtn) return null;

  return (
    <>
      {badges}
      {pendingBadges}
      {addBtn}
    </>
  );
}

function renderPersonalShift(s: Shift | undefined, ctx: RenderContext) {
  if (!s) return null;
  return renderShiftBadge(s, ctx);
}

function renderRungAroonBlocks(day: CalendarDay, ctx: RenderContext) {
  const dow = day.date.getDay();
  const dateStr = format(day.date, 'yyyy-MM-dd');
  let positions = ['OPD'];
  if (dow === 2) positions = ['OPD', 'ER', 'HIV']; // Tue
  else if (dow >= 3 && dow <= 5) positions = ['OPD', 'ER']; // Wed-Fri
  
  return (
    <div className="flex flex-col overflow-hidden [.exporting-pdf_&]:overflow-visible relative" style={{ gridArea: '5 / 1 / 8 / 2' }}>
      {positions.map((pos, idx) => {
        const matchingShifts = day.shifts.filter(s => s.shift_type === 'รุ่งอรุณ' && getDeptName(s) === 'รุ่งอรุณ' && (s as any).position === pos);
        return (
          <div key={idx} className={cn(nameCell('rung'), 'flex-wrap gap-1')}>
            {matchingShifts.map((s, i) => <div key={i}>{renderPersonalShift(s, ctx)}</div>)}
            {renderPendingAddsForCell(dateStr, 'รุ่งอรุณ', 'รุ่งอรุณ', ctx, pos)}
            {renderAddButton(dateStr, 'รุ่งอรุณ', 'รุ่งอรุณ', ctx, pos)}
          </div>
        );
      })}
    </div>
  );
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function WeekendGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const dow = day.date.getDay();
  const isSundayOrHoliday = dow === 0 || day.isHoliday;
  const isSat = dow === 6 && !day.isHoliday;

  const surgShifts = day.shifts.filter(s => s.shift_type === 'เช้า' && getDeptName(s) === 'SURG');
  const chemoShifts = day.shifts.filter(s => s.shift_type === 'เช้า' && getDeptName(s) === 'Chemo');

  // SURG pending adds for this cell (with original index in ctx.pendingAdds for remove callback)
  const surgPendingItems = (ctx.pendingAdds || [])
    .map((add, globalIdx) => ({ add, globalIdx }))
    .filter(({ add: a }) =>
      a.date === dateStr && a.shift_type === 'เช้า' && a.department === 'SURG' && (a.position || '') === ''
    );

  // Build unified slot content: real shifts fill first, remaining slots filled by pending adds
  // slot0 → real[0]  OR pending[0]  OR null (show +)
  // slot1 → real[1]  OR pending[0 or 1]  OR null (show +)
  type SurgSlot =
    | { type: 'real'; shift: (typeof surgShifts)[0] }
    | { type: 'pending'; add: (typeof surgPendingItems)[0]['add']; globalIdx: number }
    | null;

  const surgSlot0: SurgSlot = surgShifts[0]
    ? { type: 'real', shift: surgShifts[0] }
    : surgPendingItems[0]
    ? { type: 'pending', ...surgPendingItems[0] }
    : null;

  // How many pending adds were consumed by slot 0?
  const pendingConsumedBySlot0 = surgShifts[0] ? 0 : surgPendingItems[0] ? 1 : 0;

  const surgSlot1: SurgSlot = surgShifts[1]
    ? { type: 'real', shift: surgShifts[1] }
    : surgPendingItems[pendingConsumedBySlot0]
    ? { type: 'pending', ...surgPendingItems[pendingConsumedBySlot0] }
    : null;

  // Weekend bg tint
  const dateBg = isSundayOrHoliday ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700';

  return (
    <div className="grid grid-cols-5 grid-rows-[repeat(7,_minmax(2.275rem,_auto))] h-full" onClick={() => onDayClick(day)}>

      {/* ROW 1 — section labels + date number */}
      <div className={hdr('chao')} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('chao')} style={{ gridArea: '1 / 2 / 2 / 3' }}>SURG</div>
      <div className={hdr('chao')} style={{ gridArea: '1 / 3 / 2 / 4' }}>MED</div>
      <div className={hdr('bai')}  style={{ gridArea: '1 / 4 / 2 / 5' }}>บ่าย</div>
      <div className={cn(hdr('neutral'), dateBg, 'text-[21px] font-extrabold')} style={{ gridArea: '1 / 5 / 2 / 6' }}>{dayNum}</div>

      {/* ROW 2 & 3 — morning / afternoon cells */}
      <div className={nameCell('chao')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'เช้า', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className="grid grid-rows-2 border-r-2 border-r-slate-400" style={{ gridArea: '2 / 2 / 4 / 3' }}>
        {/* SURG slot บน */}
        <div className={cn(nameCell('chao'), 'flex-col border-b border-slate-300')}>
          {surgSlot0?.type === 'real'    && renderPersonalShift(surgSlot0.shift, ctx)}
          {surgSlot0?.type === 'pending' && renderPendingAddBadge(surgSlot0.add, surgSlot0.globalIdx, ctx)}
          {!surgSlot0                    && renderAddButton(dateStr, 'เช้า', 'SURG', ctx)}
        </div>
        {/* SURG slot ล่าง */}
        <div className={cn(nameCell('chao'), 'flex-col')}>
          {surgSlot1?.type === 'real'    && renderPersonalShift(surgSlot1.shift, ctx)}
          {surgSlot1?.type === 'pending' && renderPendingAddBadge(surgSlot1.add, surgSlot1.globalIdx, ctx)}
          {!surgSlot1                    && renderAddButton(dateStr, 'เช้า', 'SURG', ctx)}
        </div>
      </div>
      <div className={cn(nameCell('chao'), 'border-r-2 border-r-slate-400')} style={{ gridArea: '2 / 3 / 4 / 4' }}>{renderNames(day.shifts, 'เช้า', 'MED', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 4 / 3 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 4 / 4 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      {/* ROW 4 — ER / Chemo / ดึก labels */}
      <div className={hdr('chao')} style={{ gridArea: '4 / 1 / 5 / 2' }}>ER</div>
      <div className={hdr('chao')} style={{ gridArea: '4 / 2 / 5 / 3' }}>Chemo</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 3 / 5 / 6' }}>ดึก</div>

      {/* ROW 5-7 — night / ER / Chemo cells */}
      <div className={nameCell('chao')} style={{ gridArea: '5 / 1 / 8 / 2' }}>{renderNames(day.shifts, 'เช้า', 'ER', ctx, undefined, dateStr)}</div>

      <div className="grid grid-rows-2" style={{ gridArea: '5 / 2 / 8 / 3' }}>
        <div className={cn(nameCell('chao'), 'flex-col')}>
          {renderPersonalShift(chemoShifts[0], ctx)}
          {!chemoShifts[0] && renderPendingAddsForCell(dateStr, 'เช้า', 'Chemo', ctx)}
          {!chemoShifts[0] && renderAddButton(dateStr, 'เช้า', 'Chemo', ctx)}
        </div>
        <div className={cn(nameCell('chao'), 'flex-col')}>
          {renderPersonalShift(chemoShifts[1], ctx)}
          {!chemoShifts[1] && renderPendingAddsForCell(dateStr, 'เช้า', 'Chemo', ctx)}
          {!chemoShifts[1] && renderAddButton(dateStr, 'เช้า', 'Chemo', ctx)}
        </div>
      </div>

      <div className={nameCell('duek')} style={{ gridArea: '5 / 3 / 8 / 6' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx, undefined, dateStr)}</div>

    </div>
  );
}

function MonThuGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const smcShifts = day.shifts.filter(s => s.shift_type === 'บ่าย' && getDeptName(s) === 'SMC');

  return (
    <div className="grid grid-cols-4 grid-rows-[repeat(7,_minmax(2.275rem,_auto))] h-full" onClick={() => onDayClick(day)}>

      {/* ROW 1 */}
      <div className={hdr('bai')}     style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('bai')}     style={{ gridArea: '1 / 2 / 2 / 3' }}>SMC</div>
      <div className={hdr('bai')}     style={{ gridArea: '1 / 3 / 2 / 4' }}>บ่าย</div>
      <div className={cn(hdr('neutral'), 'bg-slate-100 text-slate-700 text-[21px] font-extrabold')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

      {/* ROW 2 & 3 */}
      <div className={nameCell('bai')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 2 / 3 / 3' }}>
        {renderPersonalShift(smcShifts[0], ctx)}
        {!smcShifts[0] && renderPendingAddsForCell(dateStr, 'บ่าย', 'SMC', ctx)}
        {!smcShifts[0] && renderAddButton(dateStr, 'บ่าย', 'SMC', ctx)}
      </div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 2 / 4 / 3' }}>
        {renderPersonalShift(smcShifts[1], ctx)}
        {!smcShifts[1] && renderPendingAddsForCell(dateStr, 'บ่าย', 'SMC', ctx)}
        {!smcShifts[1] && renderAddButton(dateStr, 'บ่าย', 'SMC', ctx)}
      </div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 3 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 3 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      {/* ROW 4 */}
      <div className={hdr('rung')} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 2 / 5 / 5' }}>ดึก</div>

      {/* ROW 5-7 */}
      {renderRungAroonBlocks(day, ctx)}
      <div className={nameCell('duek')} style={{ gridArea: '5 / 2 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx, undefined, dateStr)}</div>

    </div>
  );
}

function FridayGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  return (
    <div className="grid grid-cols-4 grid-rows-[repeat(7,_minmax(2.275rem,_auto))] h-full" onClick={() => onDayClick(day)}>

      {/* ROW 1 */}
      <div className={hdr('bai')}     style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('bai')}     style={{ gridArea: '1 / 2 / 2 / 4' }}>บ่าย</div>
      <div className={cn(hdr('neutral'), 'bg-slate-100 text-slate-700 text-[21px] font-extrabold')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

      {/* ROW 2 & 3 */}
      <div className={nameCell('bai')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 2 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 2 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      {/* ROW 4 */}
      <div className={hdr('rung')} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 2 / 5 / 5' }}>ดึก</div>

      {/* ROW 5-7 */}
      {renderRungAroonBlocks(day, ctx)}
      <div className={nameCell('duek')} style={{ gridArea: '5 / 2 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx, undefined, dateStr)}</div>

    </div>
  );
}
