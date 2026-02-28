'use client';

import { cn } from '@/lib/utils';
import { THAI_DAYS } from '@/lib/utils';
import type { Shift, User, CalendarDay, ShiftType } from '@/lib/types';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';

const cellStyle = "border-r border-b border-gray-400/50 flex items-center justify-center p-0.5 text-[11px] xl:text-xs sm:text-[11px] font-medium";
const headerStyle = "bg-gray-200/60 font-bold border-r border-b border-gray-400/60 flex items-center justify-center text-[10px] sm:text-[11px] xl:text-xs truncate tracking-tight";
const nameCellStyle = "bg-white hover:bg-violet-50/40 cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible leading-tight border-b border-r border-gray-400/50 flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 min-h-[1.5rem] relative";
const nameTextStyle = "block text-center text-[11px] xl:text-xs w-full px-0.5 leading-[1.1] [.exporting-pdf_&]:leading-[1.2] whitespace-normal break-words line-clamp-2 [.exporting-pdf_&]:line-clamp-none";

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
        <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1.3fr] border-b-2 border-gray-400/60">
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
          <div key={wi} className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1.3fr] border-b-2 border-gray-400/60 h-auto">
            {week.map((day, di) => {
              if (!day.isCurrentMonth) {
                return <div key={di} className="border-r-2 border-gray-400/60 bg-gray-100/50" />;
              }
              const dow = day.date.getDay();

              return (
                <div key={di} className={cn('border-r-2 border-gray-400/60 relative')}>
                  {day.isToday && <div className="absolute inset-0 border-[4px] border-red-500 z-50 pointer-events-none [.exporting-pdf_&]:hidden" />}
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
      <span key={i} className={cn(nameTextStyle, isMe ? 'text-violet-700 font-bold bg-violet-100/50 rounded-sm' : 'text-slate-800')}>
        {getUserName(s)}
      </span>
    );
  });
}

// ─── TEMPLATES ──────────────────────────────────────────────────────

function DayGrid({ day, currentUser, onDayClick }: { day: CalendarDay, currentUser?: User | null, onDayClick: any }) {
  const dayNum = format(day.date, 'd');
  const dow = day.date.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
  const isWeekend = dow === 0 || dow === 6;

  const br = 'border-r border-gray-400/60';
  const bb = 'border-b border-gray-400/60';
  const rowH = 'min-h-[1.5rem]';

  const subHdr = (extra?: string) => cn(
    'flex items-center justify-center font-bold text-[10px] xl:text-[11px] tracking-tight truncate',
    rowH, bb, extra
  );
  const nameCell = (extra?: string) => cn(
    'bg-white hover:bg-violet-50/40 cursor-pointer overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5',
    rowH, bb, extra
  );
  const empty = (extra?: string) => cn('bg-white', rowH, bb, extra);

  /** Sorted shift list for a given type + optional dept */
  const getList = (shiftType: ShiftType, dept?: string): Shift[] => {
    const list = day.shifts.filter(s =>
      s.shift_type === shiftType && (!dept || getDeptName(s) === dept)
    );
    list.sort((a, b) => (a.position || '').localeCompare(b.position || '', 'th', { numeric: true }));
    return list;
  };

  /** Single slot cell: shows the i-th shift or an empty cell */
  const slot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
    const list = getList(shiftType, dept);
    const s = list[i];
    const isMe = s && currentUser && s.user_id === currentUser.id;
    return (
      <div className={cn(nameCell(), cls)}>
        {s && (
          <span className={cn(nameTextStyle, isMe ? 'text-violet-700 font-bold bg-violet-100/50 rounded-sm' : 'text-slate-800')}>
            {getUserName(s)}
          </span>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════  //
  // WEEKEND (เสาร์/อาทิตย์)
  //
  // เสาร์: 6 คอล — โครงการ | Surg | MED | บ่ายMED | บ่ายER | ส่งยา สอ.
  // อาทิตย์: 5 คอล — โครงการ | Surg | MED | บ่ายMED | บ่ายER
  //
  // Layout (2 morning rows + ER row + post-ER rows):
  //   Row 0: โครงการ[0] | Surg[0] | MED[0] | บ่ายMED[0]* | บ่ายER[0]
  //   Row 1: โครงการ[1] | Surg[1] | MED[1] | (empty)*    | บ่ายER[1]
  //   ER row: "ER" | ER[0]* | (empty) | "ดึก"(gray) spanning c4+c5
  //   Post-ER row 0: (empty) | Surg[2] | MED[2] | ดึก[0] spanning c4+c5
  //   Post-ER row 1 (Sun only): (empty) | (empty) | MED[3] | (empty)
  //   (* = ลบ border-b เพื่อให้เป็น 1 ช่อง ไม่มีเส้นแบ่ง)
  //
  // สรุปจำนวน slot: โครงการ=2, ER=1, Surg=3, MED=3(เสาร์)/4(อาทิตย์)
  //                 บ่ายMED=1, บ่ายER=2, ดึก=1
  // ═══════════════════════════════════════════════════════════════════
  if (isWeekend) {
    const isSun = dow === 0;
    const isSat = dow === 6;
    const dateColor = isSun ? 'text-red-500' : 'text-indigo-600';
    const dateBg    = isSun ? 'bg-red-200'  : 'bg-[#e9d5ff]';

    // Post-ER rows: always 1 for both Sat and Sun (removes extra MED[3] row)
    const postErRows = 1;

    // Fix row height: h-[1.75rem] for consistent equal-height SURG cells
    const fixedRowH = 'h-[1.75rem]';

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
      const isMe = s && currentUser && s.user_id === currentUser.id;
      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white hover:bg-violet-50/40 cursor-pointer flex-1', cls)}>
          {s && (
            <span className={cn(nameTextStyle, isMe ? 'text-violet-700 font-bold bg-violet-100/50 rounded-sm' : 'text-slate-800')}>
              {getUserName(s)}
            </span>
          )}
        </div>
      );
    };

    // Slot cell with fixed height
    const fslot = (shiftType: ShiftType, dept: string | undefined, i: number, cls: string) => {
      const list = day.shifts.filter(s =>
        s.shift_type === shiftType && (!dept || getDeptName(s) === dept)
      ).sort((a, b) => (a.position || '').localeCompare(b.position || '', 'th', { numeric: true }));
      const s = list[i];
      const isMe = s && currentUser && s.user_id === currentUser.id;
      return (
        <div className={cn('overflow-hidden [.exporting-pdf_&]:overflow-visible flex flex-wrap content-center items-center justify-center h-full w-full p-0.5 bg-white hover:bg-violet-50/40 cursor-pointer', fixedRowH, bb, cls)}>
          {s && (
            <span className={cn(nameTextStyle, isMe ? 'text-violet-700 font-bold bg-violet-100/50 rounded-sm' : 'text-slate-800')}>
              {getUserName(s)}
            </span>
          )}
        </div>
      );
    };
    const fempty = (cls: string) => <div className={cn('bg-white', fixedRowH, bb, cls)} />;

    return (
      <div className="flex flex-col h-full w-full" onClick={() => onDayClick(day)}>

        {/* Date header */}
        <div className={cn('flex items-center justify-center font-bold text-sm h-7', dateBg, dateColor, bb)}>
          {dayNum}
        </div>

        {/* Column sub-headers */}
        <div className="flex">
          <div className={cn(c1, br, subHdr('bg-gray-200/60 text-gray-600'))}>โครงการ</div>
          <div className={cn(c2, br, subHdr('bg-gray-200/60 text-gray-800'))}>Surg</div>
          <div className={cn(c3, br, subHdr('bg-gray-200/60 text-gray-800'))}>MED</div>
          <div className={cn(c4, br, subHdr('bg-[#fffbeb] text-amber-700'))}>บ่ายMED</div>
          <div className={cn(c5, isSat ? br : '', subHdr('bg-[#fffbeb] text-amber-700'))}>บ่ายER</div>
          {isSat && <div className={cn('flex-1', subHdr('bg-gray-200/60 text-gray-700'))}>ส่งยา สอ.</div>}
        </div>

        {/* === Rows Container === */}
        <div className="relative flex-1 flex flex-col items-stretch">
          {/* Morning Row 0 */}
          <div className="flex">
            {fslot('เช้า', 'โครงการ',  0, cn(c1, br))}
            {fempty(cn(c2, br))}
            {fslot('เช้า', 'MED',       0, cn(c3, br))}
            {/* บ่ายMED: ลบ border-b เพื่อให้ดูเป็น 1 ช่อง (ไม่มีเส้นแบ่ง) */}
            {fslot('บ่าย', 'MED',       0, cn(c4, br, 'border-b-0'))}
            {fslot('บ่าย', 'ER',        0, cn(c5, isSat ? br : ''))}
            {isSat && fslot('เช้า', 'ส่งยา สอ.', 0, 'flex-1')}
          </div>

          {/* Morning Row 1 */}
          <div className="flex">
            {fslot('เช้า', 'โครงการ',  1, cn(c1, br))}
            {fempty(cn(c2, br))}
            {fslot('เช้า', 'MED',       1, cn(c3, br))}
            {/* บ่ายMED empty: ลบ border-b → ให้ต่อเนื่องกับ row 0 เป็น 1 ช่อง */}
            {fempty(cn(c4, br, 'border-b-0'))}
            {fslot('บ่าย', 'ER',        1, cn(c5, isSat ? br : ''))}
            {isSat && fempty(cn('flex-1'))}
          </div>

          {/* ER separator row (gray) */}
          <div className="flex">
            <div className={cn(c1, br, bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-gray-700', fixedRowH)}>ER</div>
            {/* SURG area empty string to retain border */}
            {fempty(cn(c2, br))}
            {fempty(cn(c3, br))}
            {/* ดึก label: spans c4+c5 เท่านั้น */}
            <div className={cn(dukW, isSat ? br : '', bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-indigo-700', fixedRowH)}>ดึก</div>
            {isSat && fempty('flex-1')}
          </div>

          {/* Post-ER rows: MED[2+], ดึก[0] spanning */}
          {Array.from({ length: postErRows }, (_, i) => (
            <div key={i} className="flex">
              {fempty(cn(c1, br, i === postErRows - 1 ? 'border-b-0' : ''))}
              {fempty(cn(c2, br, i === postErRows - 1 ? 'border-b-0' : ''))}
              {/* MED[2] / MED[3] */}
              {fslot('เช้า', 'MED', i + 2, cn(c3, br, i === postErRows - 1 ? 'border-b-0' : ''))}
              {/* ดึก[0] in first post-ER row, spanning c4+c5 */}
              {i === 0
                ? fslot('ดึก', 'ER', 0, cn(dukW, isSat ? br : '', postErRows === 1 ? 'border-b-0' : ''))
                : <div className={cn(dukW, isSat ? br : '', 'bg-white', fixedRowH, i === postErRows - 1 ? 'border-b-0' : '')} />
              }
              {isSat && fempty(cn('flex-1', i === postErRows - 1 ? 'border-b-0' : ''))}
            </div>
          ))}

          {/* SURG Overlay (3 equal height slots) */}
          <div 
            className={cn("absolute top-0 bottom-0 bg-white flex flex-col z-10", br)} 
            style={{ 
              left: isSat ? '15%' : '20%', 
              width: isSat ? '15%' : '20%' 
            }}
          >
            {surgSlot('เช้า', 'SURG', 0, 'border-b border-gray-400/60')}
            {surgSlot('เช้า', 'SURG', 1, 'border-b border-gray-400/60')}
            {surgSlot('เช้า', 'SURG', 2, '')}
          </div>
        </div>

      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // WEEKDAY (จันทร์–ศุกร์)
  //
  // 3 คอล: โครงการ | บ่ายMED | บ่าย ER
  //   (ดึก แสดงใน SMC separator row — ไม่มีคอลแยก)
  //
  // สรุปจำนวน slot: โครงการ=2, บ่ายMED=1, บ่ายER=2, ดึก=1, smc=2
  //
  // จันทร์–พฤหัส:
  //   Row 0: โครงการ[0] | บ่ายMED[0] | บ่ายER[0]
  //   Row 1: โครงการ[1] | (empty)    | บ่ายER[1]
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

      {/* Date header */}
      <div className={cn('flex items-center justify-center font-bold text-sm h-7 bg-gray-200/60 text-gray-900', bb)}>
        {dayNum}
      </div>

      {/* Column sub-headers: โครงการ | บ่ายMED | บ่าย ER */}
      <div className="flex">
        <div className={cn(col1w, br, subHdr('bg-gray-200/60 text-gray-600'))}>โครงการ</div>
        <div className={cn(col1w, br, subHdr('bg-[#fffbeb] text-amber-700'))}>บ่ายMED</div>
        <div className={cn('flex-1',  subHdr('bg-[#fffbeb] text-amber-700'))}>บ่าย ER</div>
      </div>

      {/* Row 0: โครงการ[0] | บ่ายMED[0] | บ่ายER[0] */}
      <div className="flex">
        {slot('เช้า', 'โครงการ', 0, cn(col1w, br))}
        {slot('บ่าย', 'MED',     0, cn(col1w, br, 'border-b-0'))}
        {slot('บ่าย', 'ER',      0, 'flex-1')}
      </div>

      {/* Row 1: โครงการ[1] | (empty) | บ่ายER[1] */}
      <div className="flex">
        {slot('เช้า', 'โครงการ', 1, cn(col1w, br))}
        <div className={cn(col1w, br, empty())} />
        {slot('บ่าย', 'ER',      1, 'flex-1')}
      </div>

      {/* Friday: no SMC section — but has 'ดึก' and 'รุ่งอรุณ' */}
      {isFriday ? (
        <>
          {/* Separator row: "รุ่งอรุณ" | "ดึก" */}
          <div className="flex">
            <div className={cn(col1w, br, bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-gray-700', rowH)}>รุ่งอรุณ</div>
            <div className={cn('flex-1', bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-indigo-700', rowH)}>ดึก</div>
          </div>
          {/* Row 0 */}
          <div className="flex">
            {slot('รุ่งอรุณ', 'OPD', 0, cn(col1w, br))}
            {slot('ดึก', 'ER', 0, cn('flex-1', 'border-b-0'))}
          </div>
          {/* Row 1 */}
          <div className="flex">
            {slot('รุ่งอรุณ', 'OPD', 1, cn(col1w, br, 'border-b-0'))}
            <div className={cn('flex-1', empty('border-b-0'))} />
          </div>
        </>
      ) : (
        <>
          {/* Separator row: "รุ่งอรุณ" | "SMC" | "ดึก" */}
          <div className="flex">
            <div className={cn(col1w, br, bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-gray-700', rowH)}>รุ่งอรุณ</div>
            <div className={cn(col1w, br, bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-red-500', rowH)}>SMC</div>
            <div className={cn('flex-1', bb, 'bg-gray-200/60 flex items-center justify-center font-bold text-[11px] text-indigo-700', rowH)}>ดึก</div>
          </div>

          {/* Row 0 */}
          <div className="flex">
            {slot('รุ่งอรุณ', 'OPD', 0, cn(col1w, br))}
            {slot('บ่าย', 'SMC', 0, cn(col1w, br))}
            {slot('ดึก',  'ER',  0, cn('flex-1', 'border-b-0'))}
          </div>

          {/* Row 1 */}
          <div className="flex">
            {slot('รุ่งอรุณ', 'OPD', 1, cn(col1w, br, 'border-b-0'))}
            {slot('บ่าย', 'SMC', 1, cn(col1w, br, 'border-b-0'))}
            {slot('ดึก',  'ER',  1, cn('flex-1', 'border-b-0'))}
          </div>
        </>
      )}

    </div>
  );
}

