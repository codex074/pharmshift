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
  roleGroup?: string;
  canRequestAction?: boolean;
  onClose: () => void;
  onSwapClick: (shift: Shift) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUserName(s: Shift): string {
  return (s as any).user_nickname || s.user?.nickname || s.user?.f_name || (s as any).user_f_name || '—';
}
function getDeptName(s: Shift): string {
  return (s as any).department_name || s.department?.name || '';
}

// Merged pharmacist เช้า MED group: DC, M1 first, then legacy SURG-department
// shifts (blank/s1/s2 position) displayed as M2/M3 in encounter order.
const PHARM_MED_ORDER: Record<string, number> = { 'D/C': 0, M1: 1, M2: 2, M3: 3 };
function pharmMedDisplayOrder(shifts: Shift[]): { shift: Shift; label?: string }[] {
  let legacyIdx = 0;
  const withLabel = shifts.map((s) => {
    const rawPos = (s as any).position || '';
    let label: string;
    if (rawPos === 'DC' || rawPos === 'D/C') label = 'D/C';
    else if (rawPos === 'M1' || rawPos === 'Cont') label = 'M1';
    else if (rawPos === 'M2' || rawPos === 'M3') label = rawPos;
    else { label = legacyIdx === 0 ? 'M2' : 'M3'; legacyIdx += 1; }
    return { shift: s, label };
  });
  return withLabel.sort((a, b) => (PHARM_MED_ORDER[a.label] ?? 4) - (PHARM_MED_ORDER[b.label] ?? 4));
}

// Shift display order (chronological)
const TIMELINE_ORDER: ShiftType[] = ['รุ่งอรุณ', 'เช้า', 'smc', 'บ่าย', 'ดึก'];

// ─── Timeline view ─────────────────────────────────────────────────────────────
function TimelineView({
  day,
  currentUser,
  canRequestAction,
  onSwapClick,
  roleGroup,
}: {
  day: CalendarDay;
  currentUser: User | null;
  canRequestAction: boolean;
  onSwapClick: (s: Shift) => void;
  roleGroup?: string;
}) {
  const groups = TIMELINE_ORDER
    .map((type) => ({ type, shifts: day.shifts.filter((s) => s.shift_type === type) }))
    .filter((g) => g.shifts.length > 0);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
        <span className="text-4xl">📭</span>
        <span className="text-sm">ไม่มีเวรในวันนี้</span>
      </div>
    );
  }

  return (
    <div className="relative py-1">
      {/* Vertical timeline rail */}
      <div className="absolute left-[62px] top-5 bottom-5 w-px bg-gray-200" />

      <div className="space-y-4">
        {groups.map(({ type, shifts }, idx) => {
          const cfg = SHIFT_CONFIG[type];
          const startTime = cfg.time.split('-')[0];

          // Group shifts by department for display
          const deptMap = new Map<string, Shift[]>();
          for (const s of shifts) {
            let dept = getDeptName(s) || 'ทั่วไป';
            // Pharmacist เช้า SURG rooms were merged into MED (M2/M3) — legacy SURG-department
            // shifts keep their real department in the DB, but display grouped under MED.
            if (roleGroup === 'pharmacist' && type === 'เช้า' && dept === 'SURG') dept = 'MED';
            if (!deptMap.has(dept)) deptMap.set(dept, []);
            deptMap.get(dept)!.push(s);
          }
          const depts = Array.from(deptMap.entries());

          const isLast = idx === groups.length - 1;

          return (
            <div key={type} className="flex gap-3 items-start">
              {/* Time label */}
              <div className="w-[62px] flex-shrink-0 flex flex-col items-end pt-3 pr-3">
                <span className="text-[10px] text-gray-400 font-mono leading-none">{startTime}</span>
              </div>

              {/* Timeline dot */}
              <div className="relative flex flex-col items-center flex-shrink-0 z-10">
                <div
                  className="w-3 h-3 rounded-full border-2 border-white mt-2.5 ring-2"
                  style={{
                    backgroundColor: cfg.color,
                    boxShadow: `0 0 0 3px ${cfg.color}30`,
                  }}
                />
              </div>

              {/* Shift card */}
              <div
                className="flex-1 rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-1"
                style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
              >
                {/* Card header */}
                <div
                  className="px-3 py-2.5 flex items-center gap-2"
                  style={{ backgroundColor: cfg.color + '14' }}
                >
                  <span className="text-base leading-none">{cfg.icon}</span>
                  <span className="text-sm font-bold leading-none" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400 font-mono">{cfg.time}</span>
                </div>

                {/* Staff per department */}
                {depts.map(([dept, deptShifts]) => {
                  const isPharmMedMerged = roleGroup === 'pharmacist' && type === 'เช้า' && dept === 'MED';
                  const ordered = isPharmMedMerged
                    ? pharmMedDisplayOrder(deptShifts)
                    : deptShifts.map((s) => ({ shift: s, label: (s as any).position || undefined }));
                  return (
                  <div
                    key={dept}
                    className="px-3 py-2 border-t border-gray-50 flex flex-wrap items-center gap-1.5"
                  >
                    {dept !== 'ทั่วไป' && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white flex-shrink-0"
                        style={{ backgroundColor: DEPT_COLORS[dept] || '#9ca3af' }}
                      >
                        {dept}
                      </span>
                    )}
                    {ordered.map(({ shift: s, label }) => {
                      const isMe = currentUser?.id === s.user_id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (canRequestAction) onSwapClick(s);
                          }}
                          disabled={!canRequestAction}
                          className={cn(
                            'text-[11px] px-2.5 py-1 rounded-full transition-all font-medium',
                            isMe
                              ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-300'
                              : canRequestAction
                                ? 'bg-gray-100 text-gray-700 hover:bg-violet-50 hover:text-violet-700'
                                : 'bg-gray-100 text-gray-500 cursor-default',
                          )}
                        >
                          {getUserName(s)}
                          {label ? <span className="opacity-60 text-[9px] ml-0.5">({label})</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* End time label */}
        {groups.length > 0 && (() => {
          const last = groups[groups.length - 1];
          const endTime = SHIFT_CONFIG[last.type].time.split('-')[1];
          return (
            <div className="flex gap-3 items-center">
              <div className="w-[62px] flex-shrink-0 flex items-end justify-end pr-3">
                <span className="text-[10px] text-gray-400 font-mono">{endTime}</span>
              </div>
              <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center z-10">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DayDetailModal({ day, currentUser, roleGroup, canRequestAction = true, onClose, onSwapClick }: DayDetailModalProps) {
  const dayNumber = format(day.date, 'd');
  const dayOfWeek = UTILS_THAI_DAYS[day.date.getDay()];
  const dow = day.date.getDay();
  const isWeekend = dow === 0 || dow === 6;

  const buddhistYear = day.date.getFullYear() + 543;
  const thaiMonthName = THAI_MONTHS[day.date.getMonth()];
  const thaiFullDate = `วัน${dayOfWeek}ที่ ${dayNumber} ${thaiMonthName} ${buddhistYear}`;

  // Count shifts that belong to current user
  const myShifts = day.shifts.filter((s) => currentUser && s.user_id === currentUser.id);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
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
                <span className="text-[10px] text-violet-200 bg-white/20 px-2 py-0.5 rounded-full font-medium">
                  วันนี้
                </span>
              )}
            </div>
            <p className="text-white/70 text-[11px] mt-0.5 font-medium">{thaiFullDate}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* My shift banner */}
        {myShifts.length > 0 && (
          <div className="mx-3 mt-3 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl flex items-center gap-2">
            <span className="text-sm">🙋</span>
            <span className="text-xs font-semibold text-violet-700">
              คุณมีเวร {myShifts.map((s) => SHIFT_CONFIG[s.shift_type]?.label ?? s.shift_type).join(', ')} ในวันนี้
            </span>
          </div>
        )}

        {/* Timeline content */}
        <div className="px-3 py-3 max-h-[60vh] overflow-y-auto">
          <TimelineView day={day} currentUser={currentUser} canRequestAction={canRequestAction} onSwapClick={onSwapClick} roleGroup={roleGroup} />
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-gray-50 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            {canRequestAction ? 'แตะชื่อเพื่อขอแลกเวร' : 'ดูตารางเวรได้อย่างเดียว'}
          </p>
          <span
            className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              day.isToday ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500',
            )}
          >
            {day.shifts.length > 0 ? `${day.shifts.length} เวร` : 'ไม่มีเวร'}
          </span>
        </div>
      </div>
    </div>
  );
}
