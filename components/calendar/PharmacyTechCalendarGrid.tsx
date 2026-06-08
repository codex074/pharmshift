'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType, Holiday } from '@/lib/types';
import { format } from 'date-fns';
import { buildCalendarWeeks } from '@/lib/calendarMonthGrid';
import { getIndexedSlotPosition } from '@/lib/shiftSlotRules';
import type { PendingAdd, AddShiftContext } from './AdminAddShiftModal';

// ── Shared border / layout helpers ─────────────────────────────────────────
const BORDER = 'border-gray-200';
const nameTextStyle = "block text-center text-[12px] sm:text-[13px] xl:text-[13px] [.exporting-pdf_&]:text-[11px] font-medium w-full px-0.5 py-[2px] sm:py-[3px] leading-[1.28] [.exporting-pdf_&]:leading-[1.05] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px]";
const DAY_GRID_ROWS = 'grid-rows-[repeat(7,_2.75rem)]';

// ── Shift-time colour palettes ─────────────────────────────────
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

const DOW_HDR: Record<number, string> = {
  0: 'bg-[#F3828A] text-red-900',
  1: 'bg-[#FEE66A] text-yellow-900',
  2: 'bg-[#FFB1DC] text-pink-900',
  3: 'bg-[#B6E666] text-green-900',
  4: 'bg-[#FEA86F] text-orange-900',
  5: 'bg-[#A1DDFF] text-sky-900',
  6: 'bg-[#D0AEEF] text-purple-900',
};

function hdr(palette: keyof typeof SHIFT_HDR, extra = '') {
  return cn(`${SHIFT_HDR[palette]} font-semibold border-r border-b flex items-center justify-center text-[10px] sm:text-[11px] xl:text-xs truncate`, extra);
}

function nameCell(palette: keyof typeof CELL_BG = 'plain', extra = '') {
  return cn(`${CELL_BG[palette]} cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible leading-tight border-b border-r ${BORDER} flex flex-col justify-evenly items-center gap-1 h-full w-full px-1 py-1.5 min-h-[2.15rem] relative [.exporting-pdf_&]:min-h-0 [.exporting-pdf_&]:p-0.5 [.exporting-pdf_&]:gap-0 [.exporting-pdf_&]:justify-center`, extra);
}

function centeredNameCell(palette: keyof typeof CELL_BG = 'plain', extra = '') {
  return nameCell(palette, cn('justify-center gap-0', extra));
}

function headerWithDate(
  title: string,
  palette: keyof typeof SHIFT_HDR,
  dayNum: string,
  dateClass: string,
) {
  return (
    <div className={cn(hdr(palette), 'relative h-full justify-center pr-14')}>
      {title}
      <span className={cn(hdr('neutral'), 'absolute inset-y-0 right-0 w-12 border-l text-[20px] font-black', dateClass)}>
        {dayNum}
      </span>
    </div>
  );
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

export function PharmacyTechCalendarGrid({
  year, month, shifts, holidays, prevMonthLastDayShifts, currentUser, onDayClick, onShiftClick,
  isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift,
  pendingAdds, onAddShift, onRemovePendingAdd
}: CalendarGridProps) {
  const weeks = buildCalendarWeeks(year, month, shifts, holidays, prevMonthLastDayShifts);

  const ctx: RenderContext = {
    currentUser, isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift,
    onShiftClick, pendingAdds, onAddShift, onRemovePendingAdd,
    roleFilter: 'pharmacy_technician',
  };

  return (
    <div className="w-full overflow-x-auto border border-gray-200 rounded-2xl shadow-sm bg-white">
      <div className="min-w-[1000px] select-none">

        {/* Header Row — day names */}
        <div className="grid grid-cols-7">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-2.5 text-center text-sm font-semibold',
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
  roleFilter?: string;
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
        <span title={displayName} className={cn("text-[11px] flex-1 min-w-0 truncate mr-1", isPendingDelete && "line-through text-red-400", pendingSub && "text-indigo-700 font-bold")}>
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
          "inline-flex items-center gap-0.5 text-white font-bold text-xs rounded-lg px-1.5 py-0.5 shadow-md transition-all ring-1 ring-white/40 [.exporting-pdf_&]:bg-violet-100 [.exporting-pdf_&]:text-violet-800 [.exporting-pdf_&]:shadow-none",
          canClickShift && "hover:shadow-lg",
        )}
          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
        >
          {displayName}
        </span>
      </span>
    );
  }

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
      <span title={add.user.nickname || add.user.f_name} className="text-[11px] flex-1 min-w-0 truncate mr-1 text-green-800 font-bold">
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

function renderAddButton(dateStr: string, shiftType: ShiftType, deptName: string, ctx: RenderContext, position?: string, buttonLabel?: string) {
  if (!ctx.isEditMode || !ctx.onAddShift) return null;
  const label = buttonLabel ?? (position ? `+${position}` : '+');
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
    if (
      add.date === dateStr &&
      add.shift_type === shiftType &&
      add.department === deptName &&
      (add.position || '') === (position || '') &&
      (!ctx.roleFilter || add.user.role === ctx.roleFilter)
    ) {
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

  matching.sort((a, b) => ((a as any).position || '').localeCompare((b as any).position || '', 'th', { numeric: true }));

  const badges = matching.map((s) => renderShiftBadge(s, ctx));
  const pendingBadges = dateStr ? renderPendingAddsForCell(dateStr, shiftType, deptName, ctx, position) : null;
  const hasPendingAdds = pendingBadges?.some(Boolean);

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
        const pendingEntry = (ctx.pendingAdds || [])
          .map((add, globalIdx) => ({ add, globalIdx }))
          .find(({ add: a }) =>
            a.date === dateStr && a.shift_type === 'รุ่งอรุณ' && a.department === 'รุ่งอรุณ' && (a.position || '') === pos &&
            (!ctx.roleFilter || a.user.role === ctx.roleFilter)
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

// Build ordered 2-slot list for a single (shiftType, dept) combo so empty slots show '+'.
type Slot =
  | { type: 'real'; shift: Shift }
  | { type: 'pending'; add: PendingAdd; globalIdx: number }
  | null;

function buildTwoSlots(day: CalendarDay, ctx: RenderContext, shiftType: ShiftType, deptName: string, positions?: [string, string]): [Slot, Slot] {
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const matching = day.shifts.filter(s => s.shift_type === shiftType && getDeptName(s) === deptName);
  matching.sort((a, b) => ((a as any).position || '').localeCompare((b as any).position || '', 'th', { numeric: true }));

  const pendingItems = (ctx.pendingAdds || [])
    .map((add, globalIdx) => ({ add, globalIdx }))
    .filter(({ add: a }) =>
      a.date === dateStr && a.shift_type === shiftType && a.department === deptName &&
      (!ctx.roleFilter || a.user.role === ctx.roleFilter)
    );

  if (positions) {
    const usedShiftIds = new Set<string>();
    const usedPendingIndexes = new Set<number>();
    return positions.map((position) => {
      const exactShift = matching.find(s => (s.position || '') === position && !usedShiftIds.has(s.id));
      if (exactShift) {
        usedShiftIds.add(exactShift.id);
        return { type: 'real', shift: exactShift };
      }

      const exactPending = pendingItems.find(item =>
        (item.add.position || '') === position && !usedPendingIndexes.has(item.globalIdx)
      );
      if (exactPending) {
        usedPendingIndexes.add(exactPending.globalIdx);
        return { type: 'pending', ...exactPending };
      }

      const legacyShifts = matching.filter(s => !(s.position || '') && !usedShiftIds.has(s.id));
      const legacyShift = legacyShifts[0];
      if (legacyShift) {
        usedShiftIds.add(legacyShift.id);
        return { type: 'real', shift: legacyShift };
      }

      const legacyPendingItems = pendingItems.filter(item => !(item.add.position || '') && !usedPendingIndexes.has(item.globalIdx));
      const legacyPending = legacyPendingItems[0];
      if (legacyPending) {
        usedPendingIndexes.add(legacyPending.globalIdx);
        return { type: 'pending', ...legacyPending };
      }

      return null;
    }) as [Slot, Slot];
  }

  const unpositionedPendingItems = pendingItems.filter(({ add: a }) => (a.position || '') === '');

  const slot0: Slot = matching[0]
    ? { type: 'real', shift: matching[0] }
    : unpositionedPendingItems[0]
    ? { type: 'pending', ...unpositionedPendingItems[0] }
    : null;

  const pendingConsumed = matching[0] ? 0 : unpositionedPendingItems[0] ? 1 : 0;

  const slot1: Slot = matching[1]
    ? { type: 'real', shift: matching[1] }
    : unpositionedPendingItems[pendingConsumed]
    ? { type: 'pending', ...unpositionedPendingItems[pendingConsumed] }
    : null;

  return [slot0, slot1];
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function WeekendGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const dow = day.date.getDay();
  const isSundayOrHoliday = dow === 0 || day.isHoliday;
  const dateBg = isSundayOrHoliday ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700';

  return (
    <div className="grid h-full grid-cols-4" style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }} onClick={() => onDayClick(day)}>
      <div className={hdr('chao')} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('chao')} style={{ gridArea: '1 / 2 / 2 / 3' }}>MED</div>
      <div className="h-full" style={{ gridArea: '1 / 3 / 2 / 5' }}>
        {headerWithDate('บ่าย', 'bai', dayNum, isSundayOrHoliday ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700')}
      </div>

      <div className={nameCell('chao')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'เช้า', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className="grid grid-rows-2 border-r border-b border-gray-200 bg-yellow-100" style={{ gridArea: '2 / 2 / 4 / 3' }}>
        <div className="flex min-h-0 items-center justify-center border-b border-gray-200 px-1">
          {renderNames(day.shifts, 'เช้า', 'MED', ctx, 'm1', dateStr)}
        </div>
        <div className="flex min-h-0 items-center justify-center px-1">
          {renderNames(day.shifts, 'เช้า', 'MED', ctx, 'm2', dateStr)}
        </div>
      </div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 3 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 3 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      <div className={hdr('chao')} style={{ gridArea: '4 / 1 / 5 / 2' }}>ER</div>
      <div className={hdr('chao')} style={{ gridArea: '4 / 2 / 5 / 3' }}>SURG</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 3 / 5 / 5' }}>ดึก</div>

      <div className={nameCell('chao')} style={{ gridArea: '5 / 1 / 8 / 2' }}>{renderNames(day.shifts, 'เช้า', 'ER', ctx, undefined, dateStr)}</div>
      <div className="grid grid-rows-2 border-r border-b border-gray-200 bg-[#E8F9FA]" style={{ gridArea: '5 / 2 / 8 / 3' }}>
        <div className="flex min-h-0 items-center justify-center border-b border-gray-200 px-1">
          {renderNames(day.shifts, 'เช้า', 'SURG', ctx, 's1', dateStr)}
        </div>
        <div className="flex min-h-0 items-center justify-center px-1">
          {renderNames(day.shifts, 'เช้า', 'SURG', ctx, 's2', dateStr)}
        </div>
      </div>
      <div className={centeredNameCell('duek')} style={{ gridArea: '5 / 3 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx, undefined, dateStr)}</div>
    </div>
  );
}

function MonThuGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const smcPositions: [string, string] = [0, 1].map(index =>
    getIndexedSlotPosition({ roleGroup: 'pharmacy_technician', shiftType: 'บ่าย', department: 'SMC', index })
  ) as [string, string];
  const [smcSlot0, smcSlot1] = buildTwoSlots(day, ctx, 'บ่าย', 'SMC', smcPositions);

  return (
    <div className="grid h-full grid-cols-4" style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }} onClick={() => onDayClick(day)}>
      <div className={hdr('bai')} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className={hdr('bai')} style={{ gridArea: '1 / 2 / 2 / 3' }}>SMC</div>
      <div className="h-full" style={{ gridArea: '1 / 3 / 2 / 5' }}>
        {headerWithDate('บ่าย', 'bai', dayNum, 'bg-gray-100 text-gray-600')}
      </div>

      <div className={centeredNameCell('bai')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className="grid grid-rows-2" style={{ gridArea: '2 / 2 / 4 / 3' }}>
        <div className={cn(nameCell('bai'), 'border-b border-gray-200')}>
          {smcSlot0?.type === 'real'    && renderPersonalShift(smcSlot0.shift, ctx)}
          {smcSlot0?.type === 'pending' && renderPendingAddBadge(smcSlot0.add, smcSlot0.globalIdx, ctx)}
          {!smcSlot0                    && renderAddButton(dateStr, 'บ่าย', 'SMC', ctx, smcPositions[0], '+')}
        </div>
        <div className={nameCell('bai')}>
          {smcSlot1?.type === 'real'    && renderPersonalShift(smcSlot1.shift, ctx)}
          {smcSlot1?.type === 'pending' && renderPendingAddBadge(smcSlot1.add, smcSlot1.globalIdx, ctx)}
          {!smcSlot1                    && renderAddButton(dateStr, 'บ่าย', 'SMC', ctx, smcPositions[1], '+')}
        </div>
      </div>
      <div className={nameCell('bai')} style={{ gridArea: '2 / 3 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={nameCell('bai')} style={{ gridArea: '3 / 3 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      <div className={hdr('rung')} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 2 / 5 / 5' }}>ดึก</div>

      {renderRungAroonBlocks(day, ctx)}
      <div className={centeredNameCell('duek')} style={{ gridArea: '5 / 2 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx, undefined, dateStr)}</div>
    </div>
  );
}

function FridayGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  return (
    <div className="grid h-full grid-cols-4" style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }} onClick={() => onDayClick(day)}>
      <div className={hdr('bai')} style={{ gridArea: '1 / 1 / 2 / 2' }}>โครงการ</div>
      <div className="h-full" style={{ gridArea: '1 / 2 / 2 / 5' }}>
        {headerWithDate('บ่าย', 'bai', dayNum, 'bg-gray-100 text-gray-600')}
      </div>

      <div className={centeredNameCell('bai')} style={{ gridArea: '2 / 1 / 4 / 2' }}>{renderNames(day.shifts, 'บ่าย', 'โครงการ', ctx, undefined, dateStr)}</div>
      <div className={centeredNameCell('bai')} style={{ gridArea: '2 / 2 / 3 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'ER', ctx, undefined, dateStr)}</div>
      <div className={centeredNameCell('bai')} style={{ gridArea: '3 / 2 / 4 / 5' }}>{renderNames(day.shifts, 'บ่าย', 'MED', ctx, undefined, dateStr)}</div>

      <div className={hdr('rung')} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={hdr('duek')} style={{ gridArea: '4 / 2 / 5 / 5' }}>ดึก</div>

      {renderRungAroonBlocks(day, ctx)}
      <div className={centeredNameCell('duek')} style={{ gridArea: '5 / 2 / 8 / 5' }}>{renderNames(day.shifts, 'ดึก', 'ER', ctx, undefined, dateStr)}</div>
    </div>
  );
}
