'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType, Holiday } from '@/lib/types';
import { format } from 'date-fns';
import { DEPT_COLORS } from '@/lib/types';
import { buildCalendarWeeks } from '@/lib/calendarMonthGrid';
import type { PendingAdd, AddShiftContext } from './AdminAddShiftModal';

// ── Shared border / layout helpers ─────────────────────────────────────────
const BORDER = 'border-gray-200';
const BORDER2 = 'border-gray-300';
const cellStyle = `border-r border-b ${BORDER} flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium`;
const nameTextStyle = "block text-center text-[12px] sm:text-[13px] xl:text-[13px] [.exporting-pdf_&]:text-[11px] font-medium w-full px-0.5 py-[2px] sm:py-[3px] leading-[1.28] [.exporting-pdf_&]:leading-[1.05] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px]";
const DAY_GRID_ROWS = 'grid-rows-[repeat(7,_2.75rem)]';

// ── Shift-time colour palettes ─────────────────────────────────
// รุ่งอรุณ  → amber
// เช้า      → cyan
// บ่าย      → purple
// ดึก       → periwinkle
const SHIFT_HDR = {
  rung:    'bg-[#FFCA72] text-amber-900  border-[#FFCA72]',
  chao:    'bg-[#9FDCE0] text-teal-900   border-[#9FDCE0]',
  bai:     'bg-[#9E76B4] text-white      border-[#9E76B4]',
  duek:    'bg-[#99ABFF] text-indigo-900 border-[#99ABFF]',
  neutral: 'bg-slate-100 text-slate-700  border-slate-200',
} as const;

const CELL_BG = {
  rung:  'bg-[#FEF3DC]',
  chao:  'bg-[#E8F9FA]',
  bai:   'bg-[#F3EDF8]',
  duek:  'bg-[#EEF0FF]',
  plain: 'bg-white',
} as const;

// Per-weekday header colours (Sun=0 … Sat=6)
const DOW_HDR: Record<number, string> = {
  0: 'bg-[#F3828A] text-red-900',     // อา.
  1: 'bg-[#FEE66A] text-yellow-900',  // จ.
  2: 'bg-[#FFB1DC] text-pink-900',    // อ.
  3: 'bg-[#B6E666] text-green-900',   // พ.
  4: 'bg-[#FEA86F] text-orange-900',  // พฤ.
  5: 'bg-[#A1DDFF] text-sky-900',     // ศ.
  6: 'bg-[#D0AEEF] text-purple-900',  // ส.
};

function hdr(palette: keyof typeof SHIFT_HDR, extra = '') {
  return cn(`${SHIFT_HDR[palette]} font-bold border-r border-b flex items-center justify-center text-[10px] sm:text-[11px] xl:text-xs truncate tracking-tight`, extra);
}

function nameCell(palette: keyof typeof CELL_BG = 'plain', extra = '') {
  return cn(`${CELL_BG[palette]} cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible leading-tight border-b border-r ${BORDER} flex flex-col justify-evenly items-center gap-1 h-full w-full px-1 py-1.5 min-h-[2.15rem] relative [.exporting-pdf_&]:min-h-0 [.exporting-pdf_&]:p-0.5 [.exporting-pdf_&]:gap-0 [.exporting-pdf_&]:justify-center`, extra);
}

interface CalendarGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  holidays: Holiday[];
  prevMonthLastDayShifts?: Shift[];
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

export function CalendarGrid({ 
  year, month, shifts, holidays, prevMonthLastDayShifts, currentUser, onDayClick, onShiftClick,
  isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift,
  pendingAdds, onAddShift, onRemovePendingAdd
}: CalendarGridProps) {
  const weeks = buildCalendarWeeks(year, month, shifts, holidays, prevMonthLastDayShifts);

  const ctx: RenderContext = { currentUser, isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift, onShiftClick, pendingAdds, onAddShift, onRemovePendingAdd };

  return (
    <div className="w-full overflow-x-auto border border-gray-200 rounded-2xl shadow-lg bg-white">
      <div className="min-w-[1000px] select-none">

        {/* Header Row — day names */}
        <div className="grid grid-cols-7">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-2.5 text-center text-sm font-bold tracking-wide',
              i < 6 ? 'border-r border-white/20' : '',
              DOW_HDR[i],
              i === 0 && 'rounded-tl-2xl',
              i === 6 && 'rounded-tr-2xl',
            )}>
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-slate-400 h-auto">
            {week.map((day, di) => {
              if (!day.isCurrentMonth) {
                if (day.shifts.length === 0) {
                  return <div key={di} className={cn('bg-gray-50/50', di < 6 && 'border-r border-slate-400')} />;
                }

                // Render full day layout with opacity for previous month
                const dow = day.date.getDay();
                const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;
                const prevCtx: RenderContext = { ...ctx, isEditMode: false, pendingDeletes: undefined, pendingEdits: undefined, pendingAdds: undefined };
                return (
                  <div key={di} className={cn(
                    di < 6 && 'border-r border-slate-400',
                    'relative opacity-40 pointer-events-none',
                  )}>
                    { (isWeekendOrHoliday) ? <WeekendGrid day={day} onDayClick={() => {}} ctx={prevCtx} /> :
                      (dow === 5) ? <FridayGrid day={day} onDayClick={() => {}} ctx={prevCtx} /> :
                      <MonThuGrid day={day} onDayClick={() => {}} ctx={prevCtx} />
                    }
                  </div>
                );
              }
              const dow = day.date.getDay();
              const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;

              return (
                <div key={di} className={cn(
                  di < 6 && 'border-r border-slate-400',
                  'relative',
                  day.isToday && 'bg-violet-50/40 z-10'
                )}>
                  {day.isToday && <div className="absolute inset-0 border-2 border-violet-500 z-50 pointer-events-none rounded-sm shadow-[inset_0_0_12px_rgba(124,58,237,.12)] [.exporting-pdf_&]:hidden" />}
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
  const canClickShift = !!ctx.onShiftClick;
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

  /* ── My shift — gradient pill with ring ── */
  if (isMe) {
    return (
      <span
        key={s.id}
        className={cn(
          "block text-center w-full py-[2px] sm:py-[3px] leading-[1.28] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:leading-[1.05] [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px]",
          canClickShift && "cursor-pointer",
        )}
        onClick={(e) => { e.stopPropagation(); if (canClickShift) ctx.onShiftClick?.(s); }}
      >
        <span className={cn(
          "inline-flex items-center gap-0.5 text-white font-bold text-[12px] sm:text-[13px] xl:text-[13px] [.exporting-pdf_&]:text-xs rounded-lg px-1.5 py-0.5 shadow-md transition-all ring-1 ring-white/40 [.exporting-pdf_&]:bg-violet-100 [.exporting-pdf_&]:text-violet-800 [.exporting-pdf_&]:shadow-none",
          canClickShift && "hover:shadow-lg",
        )}
          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
        >
          {displayName}
        </span>
      </span>
    );
  }

  /* ── Other people's shifts — clickable for swap ── */
  return (
    <span
      key={s.id}
      className={cn(
        nameTextStyle,
        'text-slate-700 rounded-sm transition-colors',
        canClickShift && 'cursor-pointer hover:bg-sky-100 hover:text-sky-800',
      )}
      onClick={(e) => { e.stopPropagation(); if (canClickShift) ctx.onShiftClick?.(s); }}
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

  // MED เช้า (ไม่ระบุ position) — แยก D/C และ Cont เป็น 2 slot อิสระ
  if (deptName === 'MED' && shiftType === 'เช้า' && !position && dateStr) {
    const dcShift   = matching.find(s => (s as any).position === 'D/C');
    const contShift = matching.find(s => (s as any).position === 'Cont');
    const dcPending   = renderPendingAddsForCell(dateStr, shiftType, deptName, ctx, 'D/C');
    const contPending = renderPendingAddsForCell(dateStr, shiftType, deptName, ctx, 'Cont');
    const hasDC   = !!dcShift   || dcPending?.some(Boolean);
    const hasCont = !!contShift || contPending?.some(Boolean);
    return (
      <>
        {dcShift   && renderShiftBadge(dcShift, ctx)}
        {!dcShift  && dcPending}
        {!hasDC    && renderAddButton(dateStr, shiftType, deptName, ctx, 'D/C')}
        {contShift   && renderShiftBadge(contShift, ctx)}
        {!contShift  && contPending}
        {!hasCont    && renderAddButton(dateStr, shiftType, deptName, ctx, 'Cont')}
      </>
    );
  }

  // Only show + button when there are NO existing shifts and NO pending adds
  let addBtn: React.ReactNode = null;
  if (dateStr && matching.length === 0 && !hasPendingAdds) {
    addBtn = renderAddButton(dateStr, shiftType, deptName, ctx, position);
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

function renderRungAroonBlocks(day: CalendarDay, ctx: RenderContext, gridArea = '5 / 1 / 8 / 2') {
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const positions = ['OPD', 'ER', 'HIV'];
  
  return (
    <div className="flex flex-col overflow-hidden [.exporting-pdf_&]:overflow-visible relative" style={{ gridArea }}>
      {positions.map((pos, idx) => {
        const realShift = day.shifts.find(s => s.shift_type === 'รุ่งอรุณ' && getDeptName(s) === 'รุ่งอรุณ' && (s as any).position === pos);
        // Find pending add for this specific position (with its global index for remove callback)
        const pendingEntry = (ctx.pendingAdds || [])
          .map((add, globalIdx) => ({ add, globalIdx }))
          .find(({ add: a }) =>
            a.date === dateStr && a.shift_type === 'รุ่งอรุณ' && a.department === 'รุ่งอรุณ' && (a.position || '') === pos
          );
        const isFilled = !!realShift || !!pendingEntry;
        return (
          <div key={idx} className={cn(nameCell('rung'), 'flex-col')}>
            {realShift && renderPersonalShift(realShift, ctx)}
            {pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIdx, ctx)}
            {!isFilled && renderAddButton(dateStr, 'รุ่งอรุณ', 'รุ่งอรุณ', ctx, pos)}
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

  // Chemo slot logic (same pattern as SURG — 1 person per slot)
  const chemoPendingItems = (ctx.pendingAdds || [])
    .map((add, globalIdx) => ({ add, globalIdx }))
    .filter(({ add: a }) =>
      a.date === dateStr && a.shift_type === 'เช้า' && a.department === 'Chemo' && (a.position || '') === ''
    );

  type ChemoSlot =
    | { type: 'real'; shift: (typeof chemoShifts)[0] }
    | { type: 'pending'; add: (typeof chemoPendingItems)[0]['add']; globalIdx: number }
    | null;

  const chemoSlot0: ChemoSlot = chemoShifts[0]
    ? { type: 'real', shift: chemoShifts[0] }
    : chemoPendingItems[0]
    ? { type: 'pending', ...chemoPendingItems[0] }
    : null;

  const pendingConsumedByChemoSlot0 = chemoShifts[0] ? 0 : chemoPendingItems[0] ? 1 : 0;

  const chemoSlot1: ChemoSlot = chemoShifts[1]
    ? { type: 'real', shift: chemoShifts[1] }
    : chemoPendingItems[pendingConsumedByChemoSlot0]
    ? { type: 'pending', ...chemoPendingItems[pendingConsumedByChemoSlot0] }
    : null;

  // Weekend bg tint
  const dateBg = isSundayOrHoliday ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700';

  return (
    <div className={cn("grid grid-cols-5 h-full", DAY_GRID_ROWS)} onClick={() => onDayClick(day)}>

      {/* ROW 1 — section labels + date number */}
      <div className={hdr('chao')} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('chao')} style={{ gridArea: '1 / 2 / 2 / 3' }}>SURG</div>
      <div className={hdr('chao')} style={{ gridArea: '1 / 3 / 2 / 4' }}>MED</div>
      <div className={hdr('bai')}  style={{ gridArea: '1 / 4 / 2 / 5' }}>บ่าย</div>
      <div className={cn(hdr('neutral'), dateBg, 'text-[20px] font-black')} style={{ gridArea: '1 / 5 / 2 / 6' }}>{dayNum}</div>

      {/* ROW 2 & 3 — morning / afternoon cells */}
      <div className={nameCell('chao')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'เช้า', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className="grid grid-rows-2 border-r border-gray-200" style={{ gridArea: '2 / 2 / 4 / 3' }}>
        {/* SURG slot บน */}
        <div className={cn(nameCell('chao'), 'flex-col border-b border-gray-200')}>
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
      <div className="grid grid-rows-2 border-r border-gray-200" style={{ gridArea: '2 / 3 / 4 / 4' }}>
        {/* MED D/C slot บน */}
        <div className={cn(nameCell('chao'), 'flex-col border-b border-gray-200')}>
          {renderNames(day.shifts, 'เช้า', 'MED', ctx, 'D/C', dateStr)}
        </div>
        {/* MED Cont slot ล่าง */}
        <div className={cn(nameCell('chao'), 'flex-col')}>
          {renderNames(day.shifts, 'เช้า', 'MED', ctx, 'Cont', dateStr)}
        </div>
      </div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 4 / 3 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 4 / 4 / 6' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      {/* ROW 4 — ER / Chemo / ดึก labels */}
      <div className={hdr('chao')} style={{ gridArea: '4 / 1 / 5 / 2' }}>ER</div>
      <div className={hdr('chao')} style={{ gridArea: '4 / 2 / 5 / 3' }}>Chemo</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 3 / 5 / 6' }}>ดึก</div>

      {/* ROW 5-7 — night / ER / Chemo cells */}
      <div className={nameCell('chao')} style={{ gridArea: '5 / 1 / 8 / 2' }}>{renderNames(day.shifts, 'เช้า', 'ER', ctx, undefined, dateStr)}</div>

      <div className="grid grid-rows-2" style={{ gridArea: '5 / 2 / 8 / 3' }}>
        <div className={cn(nameCell('chao'), 'flex-col border-b border-gray-200')}>
          {chemoSlot0?.type === 'real'    && renderPersonalShift(chemoSlot0.shift, ctx)}
          {chemoSlot0?.type === 'pending' && renderPendingAddBadge(chemoSlot0.add, chemoSlot0.globalIdx, ctx)}
          {!chemoSlot0                    && renderAddButton(dateStr, 'เช้า', 'Chemo', ctx)}
        </div>
        <div className={cn(nameCell('chao'), 'flex-col')}>
          {chemoSlot1?.type === 'real'    && renderPersonalShift(chemoSlot1.shift, ctx)}
          {chemoSlot1?.type === 'pending' && renderPendingAddBadge(chemoSlot1.add, chemoSlot1.globalIdx, ctx)}
          {!chemoSlot1                    && renderAddButton(dateStr, 'เช้า', 'Chemo', ctx)}
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

  // SMC slot logic (same pattern as SURG)
  const smcPendingItems = (ctx.pendingAdds || [])
    .map((add, globalIdx) => ({ add, globalIdx }))
    .filter(({ add: a }) =>
      a.date === dateStr && a.shift_type === 'บ่าย' && a.department === 'SMC' && (a.position || '') === ''
    );

  type SmcSlot =
    | { type: 'real'; shift: (typeof smcShifts)[0] }
    | { type: 'pending'; add: (typeof smcPendingItems)[0]['add']; globalIdx: number }
    | null;

  const smcSlot0: SmcSlot = smcShifts[0]
    ? { type: 'real', shift: smcShifts[0] }
    : smcPendingItems[0]
    ? { type: 'pending', ...smcPendingItems[0] }
    : null;

  const pendingConsumedBySmcSlot0 = smcShifts[0] ? 0 : smcPendingItems[0] ? 1 : 0;

  const smcSlot1: SmcSlot = smcShifts[1]
    ? { type: 'real', shift: smcShifts[1] }
    : smcPendingItems[pendingConsumedBySmcSlot0]
    ? { type: 'pending', ...smcPendingItems[pendingConsumedBySmcSlot0] }
    : null;

  return (
    <div className={cn("grid grid-cols-4 h-full", DAY_GRID_ROWS)} onClick={() => onDayClick(day)}>

      {/* ROW 1 */}
      <div className={hdr('bai')}     style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('bai')}     style={{ gridArea: '1 / 2 / 2 / 3' }}>SMC</div>
      <div className={hdr('bai')}     style={{ gridArea: '1 / 3 / 2 / 4' }}>บ่าย</div>
      <div className={cn(hdr('neutral'), 'bg-gray-100 text-gray-600 text-[20px] font-black')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

      {/* ROW 2 & 3 */}
      <div className={nameCell('bai')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx, undefined, dateStr)}</div>
      {/* SMC slot บน */}
      <div className={cn(nameCell('bai'), 'flex-col border-b border-gray-200')} style={{ gridArea: '2 / 2 / 3 / 3' }}>
        {smcSlot0?.type === 'real'    && renderPersonalShift(smcSlot0.shift, ctx)}
        {smcSlot0?.type === 'pending' && renderPendingAddBadge(smcSlot0.add, smcSlot0.globalIdx, ctx)}
        {!smcSlot0                    && renderAddButton(dateStr, 'บ่าย', 'SMC', ctx)}
      </div>
      {/* SMC slot ล่าง */}
      <div className={cn(nameCell('bai'), 'flex-col')} style={{ gridArea: '3 / 2 / 4 / 3' }}>
        {smcSlot1?.type === 'real'    && renderPersonalShift(smcSlot1.shift, ctx)}
        {smcSlot1?.type === 'pending' && renderPendingAddBadge(smcSlot1.add, smcSlot1.globalIdx, ctx)}
        {!smcSlot1                    && renderAddButton(dateStr, 'บ่าย', 'SMC', ctx)}
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
    <div className={cn("grid grid-cols-4 h-full", DAY_GRID_ROWS)} onClick={() => onDayClick(day)}>

      {/* ROW 1 */}
      <div className={hdr('bai')}     style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('bai')}     style={{ gridArea: '1 / 2 / 2 / 4' }}>บ่าย</div>
      <div className={cn(hdr('neutral'), 'bg-gray-100 text-gray-600 text-[20px] font-black')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

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
