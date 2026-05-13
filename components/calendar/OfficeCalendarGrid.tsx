'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType, Holiday } from '@/lib/types';
import { format } from 'date-fns';
import { buildCalendarWeeks } from '@/lib/calendarMonthGrid';
import type { PendingAdd, AddShiftContext } from './AdminAddShiftModal';

const BORDER = 'border-gray-300';
const cellStyle = `border-r border-b ${BORDER} flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium`;
const nameTextStyle = "block text-center text-[12px] sm:text-[13px] xl:text-[13px] [.exporting-pdf_&]:text-[11px] font-medium w-full px-0.5 py-[2px] sm:py-[3px] leading-[1.28] [.exporting-pdf_&]:leading-[1.05] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none [.exporting-pdf_&]:inline-block [.exporting-pdf_&]:w-auto [.exporting-pdf_&]:py-[1px]";

// ── Shift-time colour palettes ───────────────────────────────────────
const SHIFT_HDR = {
  rung:    'bg-[#FFCA72] text-amber-900  border-[#FFCA72]',
  chao:    'bg-[#9FDCE0] text-teal-900   border-[#9FDCE0]',
  bai:     'bg-[#9E76B4] text-white      border-[#9E76B4]',
  duek:    'bg-[#99ABFF] text-indigo-900 border-[#99ABFF]',
  neutral: 'bg-slate-100 text-slate-700  border-slate-200',
} as const;

// Per-weekday header colours (Sun=0 … Sat=6)
const DOW_HDR: Record<number, string> = {
  0: 'bg-[#F3828A] text-red-900',
  1: 'bg-[#FEE66A] text-yellow-900',
  2: 'bg-[#FFB1DC] text-pink-900',
  3: 'bg-[#B6E666] text-green-900',
  4: 'bg-[#FEA86F] text-orange-900',
  5: 'bg-[#A1DDFF] text-sky-900',
  6: 'bg-[#D0AEEF] text-purple-900',
};

function dateHeader(dayNum: string, dateClass: string, extraClass?: string) {
  return (
    <div className={cn('flex h-10 justify-end', extraClass)}>
      <div className={cn('flex h-full w-12 items-center justify-center border-l border-gray-400/60 text-[20px] font-black', dateClass)}>
        {dayNum}
      </div>
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

export function OfficeCalendarGrid({
  year, month, shifts, holidays, prevMonthLastDayShifts, currentUser, onDayClick, onShiftClick, viewMode,
  isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift,
  pendingAdds, onAddShift, onRemovePendingAdd
}: CalendarGridProps) {
  const weeks = buildCalendarWeeks(year, month, shifts, holidays, prevMonthLastDayShifts);

  const ctx: RenderContext = { currentUser, isEditMode, pendingDeletes, pendingEdits, onToggleDelete, onEditShift, onShiftClick, pendingAdds, onAddShift, onRemovePendingAdd };

  return (
    <div className="w-full overflow-x-auto border-t-2 border-l-2 border-slate-400 rounded-b-xl shadow-sm bg-white">
      <div className="min-w-[1000px] select-none">

        {/* Header Row */}
        <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1.3fr] border-b-2 border-slate-400">
          {THAI_DAYS.map((day, i) => (
            <div key={day} className={cn(
              'py-2.5 text-center text-sm font-semibold',
              'border-r-2 border-slate-400',
              DOW_HDR[i],
            )}>
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1.3fr] border-b-2 border-slate-400 h-auto">
            {week.map((day, di) => {
              if (!day.isCurrentMonth) {
                if (day.shifts.length === 0) {
                  return <div key={di} className="border-r-2 border-slate-400 bg-gray-50" />;
                }
                const prevCtx: RenderContext = { ...ctx, isEditMode: false, pendingDeletes: undefined, pendingEdits: undefined, pendingAdds: undefined };
                return (
                  <div key={di} className="border-r-2 border-slate-400 relative opacity-40 pointer-events-none">
                    <DayGrid day={day} onDayClick={() => {}} ctx={prevCtx} />
                  </div>
                );
              }
              const dow = day.date.getDay();

              return (
                <div key={di} className={cn(
                  'border-r-2 border-slate-400 relative',
                  day.isToday && 'bg-amber-50/60 z-10'
                )}>
                  {day.isToday && <div className="absolute inset-0 border-[4px] border-red-500 z-50 pointer-events-none shadow-[inset_0_0_8px_rgba(239,68,68,.25)] [.exporting-pdf_&]:hidden" />}
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
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.f_name || (shift as any).user_f_name || '';
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
  const canClickShift = !!ctx.onShiftClick;
  const isPendingDelete = ctx.pendingDeletes?.has(s.id);
  const pendingSub = ctx.pendingEdits?.[s.id];

  const displayName = pendingSub ? pendingSub.f_name : getUserName(s);

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

  if (isMe) {
    return (
      <span
        key={s.id}
        className={cn(
          nameTextStyle,
          'text-violet-700 font-bold bg-violet-100 rounded-sm',
          canClickShift && 'cursor-pointer',
        )}
        onClick={(e) => { e.stopPropagation(); if (canClickShift) ctx.onShiftClick?.(s); }}
      >
        {displayName}
      </span>
    );
  }

  /* Other people's shifts — clickable for swap */
  return (
    <span
      key={s.id}
      className={cn(
        nameTextStyle,
        'text-slate-800 transition-colors rounded-sm',
        canClickShift && 'cursor-pointer hover:bg-sky-100 hover:text-sky-800',
      )}
      onClick={(e) => { e.stopPropagation(); if (canClickShift) ctx.onShiftClick?.(s); }}
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

// ─── TEMPLATES ──────────────────────────────────────────────────────

function DayGrid({ day, ctx, onDayClick }: { day: CalendarDay, ctx: RenderContext, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dateStr = format(day.date, 'yyyy-MM-dd');
  const dow = day.date.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
  const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;

  const br = 'border-r border-gray-400/60';
  const bb = 'border-b border-gray-400/60';
  const rowH = 'min-h-[1.65rem]';

  const subHdr = (shiftPalette: keyof typeof SHIFT_HDR, extra?: string) => cn(
    `${SHIFT_HDR[shiftPalette]} flex items-center justify-center font-semibold text-[10px] xl:text-[11px] truncate`,
    rowH, bb, extra
  );
  const nameCell = (extra?: string) => cn(
    'bg-white cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5',
    rowH, bb, extra
  );
  const empty = (extra?: string) => cn('bg-white', rowH, bb, extra);

  const renderAddBtn = (shiftType: ShiftType, dept: string, position: string = '') => {
    if (!ctx.isEditMode || !ctx.onAddShift) return null;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          ctx.onAddShift!({ date: dateStr, shift_type: shiftType, department: dept, position });
        }}
        className="w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 text-green-700 hover:text-green-900 flex items-center justify-center text-base font-bold transition-all pointer-events-auto border border-green-300 shadow-[0_2px_0_0_rgba(34,197,94,1)] active:shadow-[0_0_0_0_rgba(34,197,94,1)] active:translate-y-[2px] -translate-y-[1px]"
        title="เพิ่มเวร"
      >
        +
      </button>
    );
  };

  const renderPendingAddBadge = (add: PendingAdd, globalIndex: number) => (
    <div
      key={`pending-add-${globalIndex}`}
      className="flex items-center justify-between w-full px-1 py-0.5 rounded border my-0.5 bg-green-50 border-green-300 pointer-events-auto"
    >
      <span className="text-[10px] truncate flex-1 leading-tight text-green-800 font-bold">
        {add.user.nickname || add.user.f_name}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); ctx.onRemovePendingAdd?.(globalIndex); }}
        className="w-3 h-3 ml-1 shrink-0 rounded flex items-center justify-center text-red-500 hover:text-red-700 font-bold text-[10px] leading-none"
      >
        ×
      </button>
    </div>
  );

  /** Sorted shift list for a given type + optional dept */
  const getList = (shiftType: ShiftType, dept?: string): Shift[] => {
    const list = day.shifts.filter(s =>
      s.shift_type === shiftType && (!dept || getDeptName(s) === dept)
    );
    list.sort((a, b) => (a.position || '').localeCompare(b.position || '', 'th', { numeric: true }));
    return list;
  };

  const getPendingList = (shiftType: ShiftType, dept?: string, position: string = '') => {
    const pending = (ctx.pendingAdds || [])
      .map((add, globalIndex) => ({ add, globalIndex }))
      .filter(({ add }) =>
        add.date === dateStr &&
        add.shift_type === shiftType &&
        (!dept || add.department === dept) &&
        (add.position || '') === position &&
        add.user.role === 'officer'
      );
    pending.sort((a, b) => (a.add.position || '').localeCompare(b.add.position || '', 'th', { numeric: true }));
    return pending;
  };

  const slot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
    const list = getList(shiftType, dept);
    const s = list[i];
    const pendingList = getPendingList(shiftType, dept);
    const pendingEntry = !s ? pendingList[Math.max(0, i - list.length)] : undefined;
    return (
      <div className={cn(nameCell(), cls)}>
        {s && renderShiftBadge(s, ctx)}
        {!s && pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIndex)}
        {!s && !pendingEntry && dept && renderAddBtn(shiftType, dept)}
      </div>
    );
  };

  if (day.isHoliday && dow >= 1 && dow <= 5) {
    const dateColor = 'text-red-600';
    const dateBg = 'bg-red-100';
    const fixedRowH = 'h-[1.925rem]';
    const colW = 'w-[20%]';
    const dukW = 'flex-1';

    const fslot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
      const list = getList(shiftType, dept);
      const s = list[i];
      const pendingList = getPendingList(shiftType, dept);
      const pendingEntry = !s ? pendingList[Math.max(0, i - list.length)] : undefined;

      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white cursor-pointer', fixedRowH, bb, cls)}>
          {s && renderShiftBadge(s, ctx)}
          {!s && pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIndex)}
          {!s && !pendingEntry && dept && renderAddBtn(shiftType, dept)}
        </div>
      );
    };

    const surgSlot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
      const list = getList(shiftType, dept);
      const s = list[i];
      const pendingList = getPendingList(shiftType, dept);
      const pendingEntry = !s ? pendingList[Math.max(0, i - list.length)] : undefined;

      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white cursor-pointer flex-1', cls)}>
          {s && renderShiftBadge(s, ctx)}
          {!s && pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIndex)}
          {!s && !pendingEntry && dept && renderAddBtn(shiftType, dept)}
        </div>
      );
    };

    const fempty = (cls: string) => <div className={cn('bg-white', fixedRowH, bb, cls)} />;

    return (
      <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>
        <div className="flex">
          <div className={cn(colW, br, subHdr('chao'))}>โครงการ</div>
          <div className={cn(colW, br, subHdr('chao'))}>Surg</div>
          <div className={cn(colW, br, subHdr('chao'))}>MED</div>
          <div className={cn(colW, br, subHdr('bai'))}>บ่าย</div>
          <div className={cn(colW, fixedRowH, bb, 'flex items-center justify-center border-gray-400/60 text-[10px] xl:text-[11px] font-semibold', dateBg, dateColor)}>
            {dayNum}
          </div>
        </div>

        <div className="relative flex-1 flex flex-col items-stretch">
          <div className="absolute inset-0 pointer-events-none flex z-20">
            <div className={cn(colW, br)} />
            <div className={cn(colW, br)} />
            <div className={cn(colW, br)} />
            <div className={cn(colW)} />
          </div>

          <div className="flex">
            {fslot('เช้า', 'โครงการ', 0, colW)}
            {fempty(colW)}
            {fempty(colW)}
            {fslot('บ่าย', 'ER', 0, colW)}
            {fslot('บ่าย', 'ER', 1, colW)}
          </div>

          <div className="flex">
            {fslot('เช้า', 'โครงการ', 1, colW)}
            {fempty(colW)}
            {fempty(colW)}
            <div className={cn(dukW, br, fixedRowH, bb, 'bg-white cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center p-0.5')}>
              {renderNames(day.shifts, 'บ่าย', 'MED', ctx)}
              {!getList('บ่าย', 'MED').length && renderAddBtn('บ่าย', 'MED')}
            </div>
          </div>

          <div className="flex">
            <div className={cn(colW, bb, `${SHIFT_HDR.chao} flex items-center justify-center font-semibold text-[11px]`, fixedRowH)}>ER</div>
            {fempty(colW)}
            {fempty(colW)}
            <div className={cn(dukW, bb, `${SHIFT_HDR.duek} flex items-center justify-center font-semibold text-[11px]`, fixedRowH)}>ดึก</div>
          </div>

          <div className="flex flex-1">
            {fslot('เช้า', 'ER', 0, cn(colW, 'h-full border-b-0'))}
            {fempty(cn(colW, 'h-full border-b-0'))}
            {fempty(cn(colW, 'h-full border-b-0'))}
            {fslot('ดึก', 'ER', 0, cn(dukW, 'h-full border-b-0'))}
          </div>

          <div
            className="absolute top-0 bottom-0 bg-transparent flex flex-col z-10 pointer-events-none"
            style={{ left: '20%', width: '20%' }}
          >
            {surgSlot('เช้า', 'SURG', 0, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'SURG', 1, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'SURG', 2, 'pointer-events-auto')}
          </div>

          <div
            className="absolute top-0 bottom-0 bg-transparent flex flex-col z-10 pointer-events-none"
            style={{ left: '40%', width: '20%' }}
          >
            {surgSlot('เช้า', 'MED', 0, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'MED', 1, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'MED', 2, 'pointer-events-auto')}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════  //
  // WEEKEND (เสาร์/อาทิตย์)
  //
  // เสาร์: 6 คอล — โครงการ | Surg | MED | บ่าย | วันที่ | ส่งยา สอ.
  // อาทิตย์: 5 คอล — โครงการ | Surg | MED | บ่าย | วันที่
  //
  // Layout (2 morning rows + ER row + post-ER rows):
  //   Row 0: โครงการ[0] | Surg[0] | MED[0] | บ่ายER[0] | บ่ายER[1]
  //   Row 1: โครงการ[1] | Surg[1] | MED[1] | บ่ายMED[0] spanning c4+c5
  //   ER row: "ER" | ER[0]* | (empty) | "ดึก"(gray) spanning c4+c5
  //   Post-ER row 0: (empty) | Surg[2] | MED[2] | ดึก[0] spanning c4+c5
  //   Post-ER row 1 (Sun only): (empty) | (empty) | MED[3] | (empty)
  //   (* = ลบ border-b เพื่อให้เป็น 1 ช่อง ไม่มีเส้นแบ่ง)
  //
  // สรุปจำนวน slot: โครงการ=2, ER=1, Surg=3, MED=3(เสาร์)/4(อาทิตย์)
  //                 บ่ายMED=1, บ่ายER=2, ดึก=1
  // ═══════════════════════════════════════════════════════════════════
  if (isWeekendOrHoliday) {
    const isSunOrHoliday = dow === 0 || day.isHoliday;
    const isSat = dow === 6 && !day.isHoliday; // If holiday falls on Saturday, treat it like Sunday for layout
    const dateColor = isSunOrHoliday ? 'text-red-600'   : 'text-indigo-700';
    const dateBg    = isSunOrHoliday ? 'bg-red-100'     : 'bg-indigo-100';

    // Post-ER rows: always 1 for both Sat and Sun (removes extra MED[3] row)
    const postErRows = 1;

    // Fix row height: h-[1.925rem] for consistent equal-height SURG cells
    const fixedRowH = 'h-[1.925rem]';

    // Column widths: Sat adds ส่งยา สอ. column
    const c1 = isSat ? 'w-[15%]' : 'w-[20%]';
    const c2 = isSat ? 'w-[15%]' : 'w-[20%]';
    const c3 = isSat ? 'w-[15%]' : 'w-[20%]';
    const c4 = isSat ? 'w-[15%]' : 'w-[20%]';
    const c5 = isSat ? 'w-[15%]' : 'flex-1';
    const dukW = isSat ? 'w-[30%]' : 'flex-1';

    // Slot cell with flex-1 for absolute overlay
    const surgSlot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
      const list = day.shifts.filter(s =>
        s.shift_type === shiftType && (!dept || getDeptName(s) === dept)
      ).sort((a, b) => (a.position || '').localeCompare(b.position || '', 'th', { numeric: true }));
      const s = list[i];
      const pendingList = getPendingList(shiftType, dept);
      const pendingEntry = !s ? pendingList[Math.max(0, i - list.length)] : undefined;
      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white cursor-pointer flex-1', cls)}>
          {s && renderShiftBadge(s, ctx)}
          {!s && pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIndex)}
          {!s && !pendingEntry && dept && renderAddBtn(shiftType, dept)}
        </div>
      );
    };

    const fslot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
      const list = day.shifts.filter(s =>
        s.shift_type === shiftType && (!dept || getDeptName(s) === dept)
      ).sort((a, b) => (a.position || '').localeCompare(b.position || '', 'th', { numeric: true }));
      const s = list[i];
      const pendingList = getPendingList(shiftType, dept);
      const pendingEntry = !s ? pendingList[Math.max(0, i - list.length)] : undefined;
      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white cursor-pointer', fixedRowH, bb, cls)}>
          {s && renderShiftBadge(s, ctx)}
          {!s && pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIndex)}
          {!s && !pendingEntry && dept && renderAddBtn(shiftType, dept)}
        </div>
      );
    };
    const sendYaSlot = (i: number, cls: string) => {
      const list = getList('เช้า', 'ส่งยา สอ.');
      const s = list[i];
      const pendingList = getPendingList('เช้า', 'ส่งยา สอ.');
      const pendingEntry = !s ? pendingList[Math.max(0, i - list.length)] : undefined;

      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white cursor-pointer', fixedRowH, bb, cls)}>
          {s && renderShiftBadge(s, ctx)}
          {!s && pendingEntry && renderPendingAddBadge(pendingEntry.add, pendingEntry.globalIndex)}
          {!s && !pendingEntry && renderAddBtn('เช้า', 'ส่งยา สอ.')}
        </div>
      );
    };
    const fempty = (cls: string) => <div className={cn('bg-white', fixedRowH, bb, cls)} />;

    const has4MedSlots = dow === 0 && !day.isHoliday;

    return (
      <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>
        {/* Column sub-headers */}
        <div className="flex">
          <div className={cn(c1, br, subHdr('chao'))}>โครงการ</div>
          <div className={cn(c2, br, subHdr('chao'))}>Surg</div>
          <div className={cn(c3, br, subHdr('chao'))}>MED</div>
          <div className={cn(c4, br, subHdr('bai'))}>บ่าย</div>
          <div className={cn(c5, isSat ? br : '', fixedRowH, bb, 'flex items-center justify-center border-gray-400/60 text-[10px] xl:text-[11px] font-semibold', dateBg, dateColor)}>{dayNum}</div>
          {isSat && <div className={cn('flex-1', subHdr('neutral'))}>ส่งยา สอ.</div>}
        </div>

        {/* === Rows Container === */}
        <div className="relative flex-1 flex flex-col items-stretch">
          {/* Vertical Column Borders (z-20) — c4 ไม่มี br เพื่อไม่ให้ตัดผ่านช่องดึก */}
          <div className="absolute inset-0 pointer-events-none flex z-20">
            <div className={cn(c1, br)} />
            <div className={cn(c2, br)} />
            <div className={cn(c3, br)} />
            <div className={cn(c4)} />
            <div className={cn(c5, isSat ? br : '')} />
          </div>

          {/* Morning Row 0 */}
          <div className="flex">
            {fslot('เช้า', 'โครงการ',  0, c1)}
            {fempty(c2)}
            {fempty(c3)}
            {fslot('บ่าย', 'ER',        0, c4)}
            {fslot('บ่าย', 'ER',        1, c5)}
            {isSat && sendYaSlot(0, 'flex-1')}
          </div>

          {/* Morning Row 1 */}
          <div className="flex">
            {fslot('เช้า', 'โครงการ',  1, c1)}
            {fempty(c2)}
            {fempty(c3)}
            <div className={cn(dukW, br, fixedRowH, bb, 'bg-white cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center p-0.5')}>
              {renderNames(day.shifts, 'บ่าย', 'MED', ctx)}
              {!getList('บ่าย', 'MED').length && renderAddBtn('บ่าย', 'MED')}
            </div>
            {isSat && sendYaSlot(1, 'flex-1')}
          </div>

          {/* ER separator row (gray) */}
          <div className="flex">
            <div className={cn(c1, bb, `${SHIFT_HDR.chao} flex items-center justify-center font-semibold text-[11px]`, fixedRowH)}>ER</div>
            {fempty(c2)}
            {fempty(c3)}
            {/* ดึก label: spans c4+c5 */}
            <div className={cn(dukW, bb, `${SHIFT_HDR.duek} flex items-center justify-center font-semibold text-[11px]`, fixedRowH)}>ดึก</div>
            {isSat && sendYaSlot(2, 'flex-1')}
          </div>

          {/* Post-ER rows: MED[2+], ดึก[0] spanning — flex-1 + h-full เพื่อ center ดึก */}
          {Array.from({ length: postErRows }, (_, i) => (
            <div key={i} className="flex flex-1">
              {i === 0 ? fslot('เช้า', 'ER', 0, cn(c1, 'h-full', postErRows === 1 ? 'border-b-0' : '')) : fempty(cn(c1, 'h-full', i === postErRows - 1 ? 'border-b-0' : ''))}
              {fempty(cn(c2, 'h-full', i === postErRows - 1 ? 'border-b-0' : ''))}
              {/* MED[2] / MED[3] - replaced by overlay */}
              {fempty(cn(c3, 'h-full', i === postErRows - 1 ? 'border-b-0' : ''))}
              {/* ดึก[0] in first post-ER row, spanning c4+c5 */}
              {i === 0
                ? fslot('ดึก', 'ER', 0, cn(dukW, 'h-full', postErRows === 1 ? 'border-b-0' : ''))
                : <div className={cn(dukW, 'bg-white h-full', i === postErRows - 1 ? 'border-b-0' : '')} />
              }
              {isSat && sendYaSlot(i + 3, cn('flex-1 h-full', i === postErRows - 1 ? 'border-b-0' : ''))}
            </div>
          ))}

          {/* SURG Overlay (3 equal height slots) */}
          <div 
            className="absolute top-0 bottom-0 bg-transparent flex flex-col z-10 pointer-events-none"
            style={{ 
              left: isSat ? '15%' : '20%', 
              width: isSat ? '15%' : '20%' 
            }}
          >
            {surgSlot('เช้า', 'SURG', 0, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'SURG', 1, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'SURG', 2, 'pointer-events-auto')}
          </div>

          {/* MED Overlay (3 slots for Sat/Holiday, 4 slots for Sun) */}
          <div 
            className="absolute top-0 bottom-0 bg-transparent flex flex-col z-10 pointer-events-none"
            style={{ 
              left: isSat ? '30%' : '40%', 
              width: isSat ? '15%' : '20%' 
            }}
          >
            {surgSlot('เช้า', 'MED', 0, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'MED', 1, 'border-b border-gray-400/60 pointer-events-auto')}
            {surgSlot('เช้า', 'MED', 2, has4MedSlots ? 'border-b border-gray-400/60 pointer-events-auto' : 'pointer-events-auto')}
            {has4MedSlots && surgSlot('เช้า', 'MED', 3, 'pointer-events-auto')}
          </div>
        </div>

      </div>
    );
  }

  const combinedSlot = (shiftType: ShiftType, dept: string | undefined, cls: string) => {
    const list = getList(shiftType, dept);
    
    return (
      <div className={cn(nameCell(), cls)}>
        <div className="flex flex-wrap items-center justify-center gap-y-0.5 w-full">
          {list.map((s, idx) => {
            return (
              <div key={idx} className="flex items-center w-full">
                {idx > 0 && <span className="mx-0.5 font-bold text-slate-500 text-[10px]">/</span>}
                {renderShiftBadge(s, ctx)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // positions: single string OR array — array means "match any of these"
  const combinedSlotPos = (shiftType: ShiftType, dept: string | undefined, position: string | string[], cls: string) => {
    const posArr = Array.isArray(position) ? position : [position];
    const posSet = new Set(posArr);
    const list = getList(shiftType, dept).filter(s => posSet.has(s.position || ''));
    const isRungOPD = shiftType === 'รุ่งอรุณ' && dept === 'รุ่งอรุณ' && posArr.includes('OPD');
    const maxEntries = isRungOPD ? 2 : 1;
    const stackNames = isRungOPD;
    const addPosition = Array.isArray(position) ? position[0] : position;

    // Pending adds — match any of the positions (officer role only)
    const pendingForPos = ctx.pendingAdds ? ctx.pendingAdds.filter(
      add => add.date === dateStr && add.shift_type === shiftType && (!dept || add.department === dept) && posSet.has(add.position || '') && add.user.role === 'officer'
    ) : [];
    const currentEntryCount = list.length + pendingForPos.length;

    return (
      <div className={cn(nameCell(), cls)}>
        <div className="flex flex-wrap items-center justify-center gap-y-0.5 w-full">
          {list.map((s, idx) => (
            <div key={idx} className="flex items-center w-full">
              {!stackNames && idx > 0 && <span className="mx-0.5 font-bold text-slate-500 text-[10px]">/</span>}
              {renderShiftBadge(s, ctx)}
            </div>
          ))}
          {pendingForPos.map(pa => {
            const gIdx = ctx.pendingAdds!.indexOf(pa);
            return (
              <div key={gIdx} className="flex items-center justify-between w-full px-1 py-0.5 rounded border my-0.5 bg-green-50 border-green-300 pointer-events-auto">
                <span className="text-[10px] truncate flex-1 leading-tight text-green-800 font-bold">
                  {pa.user.nickname || pa.user.f_name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); ctx.onRemovePendingAdd?.(gIdx); }}
                  className="w-3 h-3 ml-1 shrink-0 rounded flex items-center justify-center text-red-500 hover:text-red-700 font-bold text-[10px] leading-none"
                >
                  ×
                </button>
              </div>
            );
          })}
          {currentEntryCount < maxEntries && dept && renderAddBtn(shiftType, dept, addPosition)}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // WEEKDAY (จันทร์–ศุกร์)
  //
  // 3 คอล: โครงการ | บ่าย | วันที่
  //   (ดึก แสดงใน SMC separator row — ไม่มีคอลแยก)
  //
  // สรุปจำนวน slot: โครงการ=2, บ่ายMED=1, บ่ายER=2, ดึก=1, smc=2
  //
  // จันทร์–พฤหัส:
  //   Row 0: โครงการ[0] | บ่ายER[0] | บ่ายER[1]
  //   Row 1: โครงการ[1] | บ่ายMED[0] spanning c2+c3
  //   SMC row (gray): "SMC" label (red) | "ดึก" label (spanning บ่ายMED+บ่ายER)
  //   smc Row 0: smc[0] | ดึก[0](spanning)
  //   smc Row 1: smc[1] | (empty)
  //
  // ศุกร์ (dow===5): ไม่มี SMC row/slots — แค่ 2 แถวธรรมดา
  // ═══════════════════════════════════════════════════════════════════

  const isFriday = dow === 5;
  const col1w = 'w-[33.333%]';

  return (
    <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>

      {/* Column sub-headers: โครงการ | บ่าย | วันที่ */}
      <div className="flex">
        <div className={cn(col1w, br, subHdr('bai'))}>โครงการ</div>
        <div className={cn(col1w, br, subHdr('bai'))}>บ่าย</div>
        <div className={cn('flex-1', rowH, bb, 'flex items-center justify-center border-gray-400/60 text-[10px] xl:text-[11px] font-semibold bg-gray-100 text-gray-600')}>{dayNum}</div>
      </div>

      {/* บ่าย rows: ER first/second on top, MED on the row below */}
      <div className="grid grid-cols-3 grid-rows-2">
        {slot('บ่าย', 'โครงการ', 0, br)}
        {slot('บ่าย', 'ER', 0, '')}
        {slot('บ่าย', 'ER', 1, '')}
        {slot('บ่าย', 'โครงการ', 1, br)}
        <div className={cn('col-span-2', rowH, bb, 'bg-white cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center p-0.5')}>
          {renderNames(day.shifts, 'บ่าย', 'MED', ctx)}
          {!getList('บ่าย', 'MED').length && renderAddBtn('บ่าย', 'MED')}
        </div>
      </div>

      {/* Friday: no SMC section — but has 'ดึก' and 'รุ่งอรุณ' */}
      {isFriday ? (
        <>
          {/* Separator row: "รุ่งอรุณ" | "ดึก" */}
          <div className="flex">
            <div className={cn(col1w, br, bb, `${SHIFT_HDR.rung} flex items-center justify-center font-semibold text-[11px]`, rowH)}>รุ่งอรุณ</div>
            <div className={cn('flex-1', bb, `${SHIFT_HDR.duek} flex items-center justify-center font-semibold text-[11px]`, rowH)}>ดึก</div>
          </div>
          
          <div className="grid grid-cols-[1fr_2fr] flex-1">
             {/* รุ่งอรุณ Column - 2 rows (OPD / ER) */}
             <div className={cn(br, 'grid grid-rows-2')}>
               {combinedSlotPos('รุ่งอรุณ', 'รุ่งอรุณ', ['OPD', 'รo1', 'รo2'], 'border-b border-gray-400/60 h-full')}
               {combinedSlotPos('รุ่งอรุณ', 'รุ่งอรุณ', 'ER', 'h-full border-b-0')}
             </div>
             {/* ดึก ER — 1 slot เดียว */}
             {slot('ดึก', 'ER', 0, 'h-full border-b-0 flex-1')}
          </div>
        </>
      ) : (
        <>
          {/* Separator row: "รุ่งอรุณ" | "SMC" | "ดึก" */}
          <div className="flex">
            <div className={cn(col1w, br, bb, `${SHIFT_HDR.rung} flex items-center justify-center font-semibold text-[11px]`, rowH)}>รุ่งอรุณ</div>
            <div className={cn(col1w, br, bb, `${SHIFT_HDR.bai} flex items-center justify-center font-semibold text-[11px]`, rowH)}>SMC</div>
            <div className={cn('flex-1', bb, `${SHIFT_HDR.duek} flex items-center justify-center font-semibold text-[11px]`, rowH)}>ดึก</div>
          </div>

          <div className="grid grid-cols-3 flex-1">
             {/* รุ่งอรุณ Column - 2 rows (OPD / ER) */}
             <div className={cn(br, 'grid grid-rows-2')}>
               {combinedSlotPos('รุ่งอรุณ', 'รุ่งอรุณ', ['OPD', 'รo1', 'รo2'], 'border-b border-gray-400/60 h-full')}
               {combinedSlotPos('รุ่งอรุณ', 'รุ่งอรุณ', 'ER', 'h-full border-b-0')}
             </div>
             
             {/* SMC Column - 2 rows */}
             <div className={cn(br, 'grid grid-rows-2')}>
               {slot('บ่าย', 'SMC', 0, 'border-b border-gray-400/60 h-full')}
               {slot('บ่าย', 'SMC', 1, 'h-full border-b-0')}
             </div>

             {/* ดึก ER Column - 1 slot เดียว */}
             {slot('ดึก', 'ER', 0, 'h-full border-b-0')}
          </div>
        </>
      )}

    </div>
  );
}
