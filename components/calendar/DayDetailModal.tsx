'use client';

import { format } from 'date-fns';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THAI_MONTHS, THAI_DAYS as UTILS_THAI_DAYS } from '@/lib/utils';
import type { CalendarDay, Shift, User, ShiftType } from '@/lib/types';
import { DEPT_COLORS, SHIFT_CONFIG } from '@/lib/types';

interface DayDetailModalProps {
  day: CalendarDay;
  currentUser: User | null;
  /** The role group being displayed — controls which render mode is used */
  roleGroup?: string;
  onClose: () => void;
  onSwapClick: (shift: Shift) => void;
}

const SHIFT_ORDER: ShiftType[] = ['เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ'];

// ─── Shared cell style tokens ─────────────────────────────────────────────────
/** Header cell */
const H = "border border-gray-300 bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-700 text-center leading-tight px-0.5 py-1";
/** Name cell */
const N = "border border-gray-200 bg-white flex flex-col items-center justify-center gap-0.5 p-1 min-h-[1.9rem]";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUserName(s: Shift): string {
  return (s as any).user_nickname || s.user?.nickname || s.user?.f_name || (s as any).user_f_name || '—';
}
function getDeptName(s: Shift): string {
  return (s as any).department_name || s.department?.name || '';
}

interface CellProps {
  shifts: Shift[];
  type: ShiftType;
  dept: string;
  position?: string;
  currentUser: User | null;
  onSwapClick: (s: Shift) => void;
}

/** Renders names for all shifts matching (type, dept, position). Shows "ว่าง" if empty. */
function Names({ shifts, type, dept, position, currentUser, onSwapClick }: CellProps) {
  const matching = shifts.filter(s =>
    s.shift_type === type &&
    getDeptName(s) === dept &&
    (!position || (s as any).position === position),
  );
  if (matching.length === 0) {
    return <span className="text-[9px] text-gray-300 italic">ว่าง</span>;
  }
  return (
    <>
      {matching.map(s => {
        const isMe = currentUser?.id === s.user_id;
        return (
          <button
            key={s.id}
            onClick={() => onSwapClick(s)}
            className={cn(
              'text-[11px] px-1 py-0.5 rounded w-full text-center leading-tight transition-colors',
              isMe
                ? 'bg-violet-600 text-white font-bold shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-violet-50 hover:text-violet-700',
            )}
          >
            {getUserName(s)}
          </button>
        );
      })}
    </>
  );
}

/** Single shift cell (for Chemo slot 1 or 2) */
function SingleShift({ shift, currentUser, onSwapClick }: {
  shift: Shift | undefined; currentUser: User | null; onSwapClick: (s: Shift) => void;
}) {
  if (!shift) return <span className="text-[9px] text-gray-300 italic">ว่าง</span>;
  const isMe = currentUser?.id === shift.user_id;
  return (
    <button
      onClick={() => onSwapClick(shift)}
      className={cn(
        'text-[11px] px-1 py-0.5 rounded w-full text-center leading-tight transition-colors',
        isMe
          ? 'bg-violet-600 text-white font-bold shadow-sm'
          : 'bg-gray-50 text-gray-700 hover:bg-violet-50 hover:text-violet-700',
      )}
    >
      {getUserName(shift)}
    </button>
  );
}

// ─── รุ่งอรุณ rows (shared between Mon-Thu and Friday grids) ──────────────────
function RungAroonRows({ day, currentUser, onSwapClick, colSpanCols }: {
  day: CalendarDay; currentUser: User | null; onSwapClick: (s: Shift) => void; colSpanCols: number;
}) {
  const dow = day.date.getDay();
  let positions = ['OPD'];
  if (dow === 2) positions = ['OPD', 'ER', 'HIV'];
  else if (dow >= 3 && dow <= 5) positions = ['OPD', 'ER'];

  // gridArea for the รุ่งอรุณ column: rows 5-7, col 1
  // Split into sub-rows manually for equal height
  const rowHeights = positions.length === 3 ? ['2.2rem', '2.2rem', '2.2rem'] : positions.length === 2 ? ['3.3rem', '3.3rem'] : ['6.6rem'];

  return (
    <div className={N} style={{ gridArea: '5 / 1 / 8 / 2', padding: 0 }}>
      {positions.map((pos, i) => {
        const posShifts = day.shifts.filter(
          s => s.shift_type === 'รุ่งอรุณ' && getDeptName(s) === 'รุ่งอรุณ' && (s as any).position === pos,
        );
        return (
          <div
            key={pos}
            className="w-full flex flex-col items-center justify-center p-0.5 gap-0.5"
            style={{
              height: rowHeights[i],
              borderBottom: i < positions.length - 1 ? '1px solid #d1d5db' : undefined,
            }}
          >
            <span className="text-[8px] text-gray-400 leading-none">{pos}</span>
            {posShifts.length > 0 ? (
              posShifts.map(s => (
                <button
                  key={s.id}
                  onClick={() => onSwapClick(s)}
                  className={cn(
                    'text-[10px] px-1 py-0.5 rounded w-full text-center leading-tight',
                    currentUser?.id === s.user_id
                      ? 'bg-violet-600 text-white font-bold'
                      : 'bg-gray-50 text-gray-700 hover:bg-violet-50',
                  )}
                >
                  {getUserName(s)}
                </button>
              ))
            ) : (
              <span className="text-[9px] text-gray-300 italic">ว่าง</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Weekend / Holiday grid (5 cols × 7 rows) ────────────────────────────────
function WeekendTable({ day, currentUser, onSwapClick }: {
  day: CalendarDay; currentUser: User | null; onSwapClick: (s: Shift) => void;
}) {
  const dayNum = format(day.date, 'd');
  const dow = day.date.getDay();
  const isSunOrHoliday = dow === 0 || !!day.isHoliday;
  const chemoShifts = day.shifts.filter(s => s.shift_type === 'เช้า' && getDeptName(s) === 'Chemo');

  return (
    <div className="grid grid-cols-5 grid-rows-[auto_repeat(2,minmax(1.9rem,auto))_auto_repeat(3,minmax(1.9rem,auto))] rounded-xl overflow-hidden border border-gray-300 text-xs select-none">
      {/* Row 1: headers */}
      <div className={H}>โครงการ</div>
      <div className={H}>SURG</div>
      <div className={H}>MED</div>
      <div className={cn(H, 'bg-amber-50 text-amber-700')}>บ่าย</div>
      <div className={cn(H, isSunOrHoliday ? 'text-red-500' : 'text-indigo-600', 'text-sm font-bold')}>{dayNum}</div>

      {/* Rows 2-3: เช้า departments + บ่าย ER/MED */}
      <div className={N} style={{ gridArea: '2 / 1 / 4 / 2' }}>
        <Names shifts={day.shifts} type="เช้า" dept="โครงการ" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '2 / 2 / 4 / 3' }}>
        <Names shifts={day.shifts} type="เช้า" dept="SURG" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '2 / 3 / 4 / 4' }}>
        <Names shifts={day.shifts} type="เช้า" dept="MED" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '2 / 4 / 3 / 6' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '3 / 4 / 4 / 6' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="MED" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>

      {/* Row 4: section headers */}
      <div className={H} style={{ gridArea: '4 / 1 / 5 / 2' }}>ER</div>
      <div className={H} style={{ gridArea: '4 / 2 / 5 / 3' }}>Chemo</div>
      <div className={cn(H, 'bg-indigo-50 text-indigo-700')} style={{ gridArea: '4 / 3 / 5 / 6' }}>ดึก</div>

      {/* Rows 5-7: ER เช้า, Chemo 1+2, ดึก */}
      <div className={N} style={{ gridArea: '5 / 1 / 8 / 2' }}>
        <Names shifts={day.shifts} type="เช้า" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      {/* Chemo split into 2 sub-rows */}
      <div className={cn(N, 'border-b border-gray-200')} style={{ gridArea: '5 / 2 / 6 / 3' }}>
        <SingleShift shift={chemoShifts[0]} currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '6 / 2 / 8 / 3' }}>
        <SingleShift shift={chemoShifts[1]} currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '5 / 3 / 8 / 6' }}>
        <Names shifts={day.shifts} type="ดึก" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
    </div>
  );
}

// ─── Mon–Thu grid (4 cols × 7 rows) ─────────────────────────────────────────
function MonThuTable({ day, currentUser, onSwapClick }: {
  day: CalendarDay; currentUser: User | null; onSwapClick: (s: Shift) => void;
}) {
  const dayNum = format(day.date, 'd');
  const smcShifts = day.shifts.filter(s => s.shift_type === 'บ่าย' && getDeptName(s) === 'SMC');

  return (
    <div className="grid grid-cols-4 grid-rows-[auto_repeat(2,minmax(1.9rem,auto))_auto_repeat(3,minmax(1.9rem,auto))] rounded-xl overflow-hidden border border-gray-300 text-xs select-none">
      {/* Row 1: headers */}
      <div className={H}>โครงการ</div>
      <div className={H}>SMC</div>
      <div className={cn(H, 'bg-amber-50 text-amber-700')}>บ่าย</div>
      <div className={cn(H, 'text-gray-900 text-sm font-bold')}>{dayNum}</div>

      {/* Rows 2-3: บ่าย */}
      <div className={N} style={{ gridArea: '2 / 1 / 4 / 2' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="โครงการ" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={cn(N, 'border-b border-gray-200')} style={{ gridArea: '2 / 2 / 3 / 3' }}>
        <SingleShift shift={smcShifts[0]} currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '3 / 2 / 4 / 3' }}>
        <SingleShift shift={smcShifts[1]} currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '2 / 3 / 3 / 5' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '3 / 3 / 4 / 5' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="MED" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>

      {/* Row 4: section headers */}
      <div className={H} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={cn(H, 'bg-indigo-50 text-indigo-700')} style={{ gridArea: '4 / 2 / 5 / 5' }}>ดึก</div>

      {/* Rows 5-7: รุ่งอรุณ + ดึก */}
      <RungAroonRows day={day} currentUser={currentUser} onSwapClick={onSwapClick} colSpanCols={4} />
      <div className={N} style={{ gridArea: '5 / 2 / 8 / 5' }}>
        <Names shifts={day.shifts} type="ดึก" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
    </div>
  );
}

// ─── Friday grid (4 cols × 7 rows, no SMC) ──────────────────────────────────
function FridayTable({ day, currentUser, onSwapClick }: {
  day: CalendarDay; currentUser: User | null; onSwapClick: (s: Shift) => void;
}) {
  const dayNum = format(day.date, 'd');

  return (
    <div className="grid grid-cols-4 grid-rows-[auto_repeat(2,minmax(1.9rem,auto))_auto_repeat(3,minmax(1.9rem,auto))] rounded-xl overflow-hidden border border-gray-300 text-xs select-none">
      {/* Row 1: headers */}
      <div className={H}>โครงการ</div>
      <div className={cn(H, 'bg-amber-50 text-amber-700')} style={{ gridArea: '1 / 2 / 2 / 4' }}>บ่าย</div>
      <div className={cn(H, 'text-gray-900 text-sm font-bold')} style={{ gridArea: '1 / 4 / 2 / 5' }}>{dayNum}</div>

      {/* Rows 2-3: บ่าย */}
      <div className={N} style={{ gridArea: '2 / 1 / 4 / 2' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="โครงการ" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '2 / 2 / 3 / 5' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
      <div className={N} style={{ gridArea: '3 / 2 / 4 / 5' }}>
        <Names shifts={day.shifts} type="บ่าย" dept="MED" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>

      {/* Row 4: section headers */}
      <div className={H} style={{ gridArea: '4 / 1 / 5 / 2' }}>รุ่งอรุณ</div>
      <div className={cn(H, 'bg-indigo-50 text-indigo-700')} style={{ gridArea: '4 / 2 / 5 / 5' }}>ดึก</div>

      {/* Rows 5-7: รุ่งอรุณ + ดึก */}
      <RungAroonRows day={day} currentUser={currentUser} onSwapClick={onSwapClick} colSpanCols={4} />
      <div className={N} style={{ gridArea: '5 / 2 / 8 / 5' }}>
        <Names shifts={day.shifts} type="ดึก" dept="ER" currentUser={currentUser} onSwapClick={onSwapClick} />
      </div>
    </div>
  );
}

// ─── Dispatcher: picks the right table layout based on day of week ────────────
function PharmacistTableView({ day, currentUser, onSwapClick }: {
  day: CalendarDay; currentUser: User | null; onSwapClick: (s: Shift) => void;
}) {
  const dow = day.date.getDay();
  const isHolidayDay = dow === 0 || dow === 6 || !!day.isHoliday;

  if (day.shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-1">
        <span className="text-3xl">📭</span>
        <span className="text-sm">ไม่มีเวรในวันนี้</span>
      </div>
    );
  }

  if (isHolidayDay) return <WeekendTable day={day} currentUser={currentUser} onSwapClick={onSwapClick} />;
  if (dow === 5) return <FridayTable day={day} currentUser={currentUser} onSwapClick={onSwapClick} />;
  return <MonThuTable day={day} currentUser={currentUser} onSwapClick={onSwapClick} />;
}

// ─── Generic view for pharmacy_technician / officer ──────────────────────────
function GenericRoleView({ day, currentUser, onSwapClick }: {
  day: CalendarDay; currentUser: User | null; onSwapClick: (s: Shift) => void;
}) {
  const groups = SHIFT_ORDER
    .map(type => ({ type, shifts: day.shifts.filter(s => s.shift_type === type) }))
    .filter(g => g.shifts.length > 0);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-1">
        <span className="text-2xl">📭</span>
        ไม่มีเวรในวันนี้
      </div>
    );
  }

  return (
    <>
      {groups.map(({ type, shifts }) => {
        const cfg = SHIFT_CONFIG[type];
        return (
          <div key={type} className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: cfg.color + '10' }}>
              <span className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-[10px] text-gray-400 font-mono">{cfg.time}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {shifts.map(s => {
                const deptName = getDeptName(s);
                const name = getUserName(s);
                const isMe = currentUser && s.user_id === currentUser.id;
                return (
                  <div key={s.id} className="px-4 py-2 flex items-center gap-2">
                    {deptName && (
                      <span
                        className="flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                        style={{ backgroundColor: DEPT_COLORS[deptName] || '#9ca3af' }}
                      >
                        {deptName}{(s as any).position ? ` ${(s as any).position}` : ''}
                      </span>
                    )}
                    <div className="flex-1 flex justify-end">
                      <button
                        onClick={() => onSwapClick(s)}
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded-lg transition-all hover:ring-2',
                          isMe
                            ? 'bg-violet-100 text-violet-700 font-bold ring-1 ring-violet-300'
                            : 'bg-gray-100 text-gray-700 hover:ring-violet-300',
                        )}
                      >
                        {name}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DayDetailModal({ day, currentUser, roleGroup, onClose, onSwapClick }: DayDetailModalProps) {
  const dayNumber = format(day.date, 'd');
  const dayOfWeek = UTILS_THAI_DAYS[day.date.getDay()];
  const dow = day.date.getDay();
  const isWeekend = dow === 0 || dow === 6;

  // Thai Buddhist date e.g. "วันอาทิตย์ที่ 1 กุมภาพันธ์ 2569"
  const buddhistYear = day.date.getFullYear() + 543;
  const thaiMonthName = THAI_MONTHS[day.date.getMonth()];
  const thaiFullDate = `วัน${dayOfWeek}ที่ ${dayNumber} ${thaiMonthName} ${buddhistYear}`;

  const isPharmacist = !roleGroup || roleGroup === 'pharmacist';

  return (
    /* Bottom sheet on mobile, centered modal on sm+ */
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="gradient-header px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">{dayNumber}</span>
              <span className="text-white/80 text-sm font-medium">{dayOfWeek}</span>
              {(isWeekend || day.isHoliday) && (
                <span className="text-[10px] text-amber-300 bg-white/20 px-2 py-0.5 rounded-full font-medium">
                  วันหยุด
                </span>
              )}
              {day.isToday && (
                <span className="text-[10px] text-violet-200 bg-white/20 px-2 py-0.5 rounded-full font-medium">วันนี้</span>
              )}
            </div>
            <p className="text-white/70 text-[11px] mt-0.5 font-medium">{thaiFullDate}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 py-3 max-h-[65vh] overflow-y-auto space-y-2">
          {isPharmacist ? (
            <PharmacistTableView day={day} currentUser={currentUser} onSwapClick={onSwapClick} />
          ) : (
            <GenericRoleView day={day} currentUser={currentUser} onSwapClick={onSwapClick} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-gray-50 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">แตะชื่อเพื่อขอแลกเวร</p>
          <span className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-full',
            day.isToday ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500',
          )}>
            {day.shifts.length > 0 ? `${day.shifts.length} เวร` : 'ไม่มีเวร'}
          </span>
        </div>
      </div>
    </div>
  );
}
