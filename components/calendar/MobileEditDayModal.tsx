'use client';

import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Pencil, Plus, Trash2, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarDay, Shift, ShiftType, User, UserRole } from '@/lib/types';
import { SHIFT_CONFIG } from '@/lib/types';
import { getIndexedSlotPosition } from '@/lib/shiftSlotRules';
import type { PendingAdd, AddShiftContext } from './AdminAddShiftModal';

interface MobileEditDayModalProps {
  day: CalendarDay;
  roleGroup: UserRole;
  pendingDeletes: Set<string>;
  pendingEdits: Record<string, User>;
  pendingAdds: PendingAdd[];
  onClose: () => void;
  onToggleDelete: (id: string) => void;
  onEditShift: (shift: Shift) => void;
  onAddShift: (ctx: AddShiftContext) => void;
  onRemovePendingAdd: (index: number) => void;
}

interface SlotConfig {
  label: string;
  shiftType: ShiftType;
  department: string;
  position?: string;
  legacyPositions?: string[]; // same-department alt values that also satisfy this slot (pre-rename data)
  readOnly?: boolean; // display-only — no add button (used for legacy cross-department fallbacks)
  index?: number;
  roleGroup?: UserRole;
}

interface SlotSection {
  id: string;
  title: string;
  shiftType: ShiftType;
  slots: SlotConfig[];
}

function getUserName(shift: Shift) {
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.f_name || (shift as any).user_f_name || 'ไม่ระบุชื่อ';
}

function getDeptName(shift: Shift) {
  return (shift as any).department_name || shift.department?.name || '';
}

function sortShiftsForSlot(a: Shift, b: Shift) {
  return (a.position || '').localeCompare(b.position || '', 'th', { numeric: true });
}

function rangeLabels(prefix: string, count: number, shiftType: ShiftType, department: string, roleGroup?: UserRole): SlotConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    label: count === 1 ? prefix : `${prefix} ${index + 1}`,
    shiftType,
    department,
    position: getIndexedSlotPosition({ roleGroup, shiftType, department, index }) || undefined,
    index,
    roleGroup,
  }));
}

function buildSections(day: CalendarDay, roleGroup: UserRole): SlotSection[] {
  const dow = day.date.getDay();
  const isWeekendOrHoliday = dow === 0 || dow === 6 || day.isHoliday;
  const isFriday = dow === 5;

  if (roleGroup === 'pharmacist') {
    const rungSlots: SlotConfig[] = [
      { label: 'รุ่ง OPD', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'OPD' },
      { label: 'รุ่ง ER', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'ER' },
      { label: 'รุ่ง HIV', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'HIV' },
    ];

    if (isWeekendOrHoliday) {
      const legacySurg = day.shifts.filter(s => s.shift_type === 'เช้า' && getDeptName(s) === 'SURG');
      return [
        { id: 'morning', title: 'เช้า', shiftType: 'เช้า', slots: [
          { label: 'โครงการ', shiftType: 'เช้า', department: 'โครงการ', index: 0 },
          { label: 'IPD DC', shiftType: 'เช้า', department: 'MED', position: 'DC', legacyPositions: ['D/C'] },
          { label: 'IPD I1', shiftType: 'เช้า', department: 'MED', position: 'M1', legacyPositions: ['Cont'] },
          { label: 'IPD I2', shiftType: 'เช้า', department: 'MED', position: 'M2' },
          { label: 'IPD I3', shiftType: 'เช้า', department: 'MED', position: 'M3' },
          ...legacySurg.map((_s, i): SlotConfig => ({
            label: `SURG (เก่า) ${i + 1}`, shiftType: 'เช้า', department: 'SURG', index: i, readOnly: true,
          })),
          { label: 'ER', shiftType: 'เช้า', department: 'ER', index: 0 },
          ...rangeLabels('Chemo', 2, 'เช้า', 'Chemo', roleGroup),
        ]},
        { id: 'afternoon', title: 'บ่าย', shiftType: 'บ่าย', slots: [
          { label: 'บ่าย ER', shiftType: 'บ่าย', department: 'ER', index: 0 },
          { label: 'บ่าย IPD', shiftType: 'บ่าย', department: 'MED', index: 0 },
        ]},
        { id: 'night', title: 'ดึก', shiftType: 'ดึก', slots: [
          { label: 'ดึก ER', shiftType: 'ดึก', department: 'ER', index: 0 },
        ]},
      ];
    }

    return [
      rungSlots.length > 0 ? { id: 'rung', title: 'รุ่งอรุณ', shiftType: 'รุ่งอรุณ', slots: rungSlots } : null,
      { id: 'afternoon', title: 'บ่าย', shiftType: 'บ่าย', slots: [
        { label: 'โครงการ', shiftType: 'บ่าย', department: 'โครงการ', index: 0 },
        !isFriday ? rangeLabels('SMC', 2, 'บ่าย', 'SMC', roleGroup)[0] : null,
        !isFriday ? rangeLabels('SMC', 2, 'บ่าย', 'SMC', roleGroup)[1] : null,
        { label: 'บ่าย ER', shiftType: 'บ่าย', department: 'ER', index: 0 },
        { label: 'บ่าย IPD', shiftType: 'บ่าย', department: 'MED', index: 0 },
      ].filter(Boolean) as SlotConfig[] },
      { id: 'night', title: 'ดึก', shiftType: 'ดึก', slots: [
        { label: 'ดึก ER', shiftType: 'ดึก', department: 'ER', index: 0 },
      ]},
    ].filter(Boolean) as SlotSection[];
  }

  if (roleGroup === 'pharmacy_technician') {
    if (isWeekendOrHoliday) {
      return [
        { id: 'morning', title: 'เช้า', shiftType: 'เช้า', slots: [
          { label: 'โครงการ', shiftType: 'เช้า', department: 'โครงการ', index: 0 },
          ...rangeLabels('SURG', 2, 'เช้า', 'SURG', roleGroup),
          { label: 'ER', shiftType: 'เช้า', department: 'ER', index: 0 },
          ...rangeLabels('IPD', 2, 'เช้า', 'MED', roleGroup),
        ]},
        { id: 'afternoon', title: 'บ่าย', shiftType: 'บ่าย', slots: [
          { label: 'บ่าย IPD', shiftType: 'บ่าย', department: 'MED', index: 0 },
          { label: 'บ่าย ER', shiftType: 'บ่าย', department: 'ER', index: 0 },
        ]},
        { id: 'night', title: 'ดึก', shiftType: 'ดึก', slots: [
          { label: 'ดึก ER', shiftType: 'ดึก', department: 'ER', index: 0 },
        ]},
      ];
    }

    return [
      { id: 'rung', title: 'รุ่งอรุณ', shiftType: 'รุ่งอรุณ', slots: [
        { label: 'รุ่ง OPD', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'OPD' },
        { label: 'รุ่ง ER', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'ER' },
        { label: 'รุ่ง HIV', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'HIV' },
      ] },
      { id: 'afternoon', title: 'บ่าย', shiftType: 'บ่าย', slots: [
        { label: 'โครงการ', shiftType: 'บ่าย', department: 'โครงการ', index: 0 },
        ...rangeLabels('SMC', 2, 'บ่าย', 'SMC', roleGroup),
        { label: 'บ่าย IPD', shiftType: 'บ่าย', department: 'MED', index: 0 },
        { label: 'บ่าย ER', shiftType: 'บ่าย', department: 'ER', index: 0 },
      ]},
      { id: 'night', title: 'ดึก', shiftType: 'ดึก', slots: [
        { label: 'ดึก ER', shiftType: 'ดึก', department: 'ER', index: 0 },
      ]},
    ];
  }

  if (isWeekendOrHoliday) {
    const isSat = dow === 6 && !day.isHoliday;
    return [
      { id: 'morning', title: 'เช้า', shiftType: 'เช้า', slots: [
        ...rangeLabels('โครงการ', 2, 'เช้า', 'โครงการ', roleGroup),
        ...rangeLabels('SURG', 3, 'เช้า', 'SURG', roleGroup),
        ...rangeLabels('IPD', dow === 0 && !day.isHoliday ? 4 : 3, 'เช้า', 'MED', roleGroup),
        { label: 'ER', shiftType: 'เช้า', department: 'ER', index: 0 },
        ...(isSat ? rangeLabels('ส่งยา สอ.', 1, 'เช้า', 'ส่งยา สอ.', roleGroup) : []),
      ]},
      { id: 'afternoon', title: 'บ่าย', shiftType: 'บ่าย', slots: [
        { label: 'บ่าย IPD', shiftType: 'บ่าย', department: 'MED', index: 0 },
        ...rangeLabels('บ่าย ER', 2, 'บ่าย', 'ER', roleGroup),
      ]},
      { id: 'night', title: 'ดึก', shiftType: 'ดึก', slots: [
        { label: 'ดึก ER', shiftType: 'ดึก', department: 'ER', index: 0 },
      ]},
    ];
  }

  return [
    { id: 'afternoon', title: 'บ่าย', shiftType: 'บ่าย', slots: [
      ...rangeLabels('โครงการ', 2, 'บ่าย', 'โครงการ', roleGroup),
      { label: 'บ่าย IPD', shiftType: 'บ่าย', department: 'MED', index: 0 },
      ...rangeLabels('บ่าย ER', 2, 'บ่าย', 'ER', roleGroup),
      ...(!isFriday ? rangeLabels('SMC', 2, 'บ่าย', 'SMC', roleGroup) : []),
    ]},
    { id: 'rung', title: 'รุ่งอรุณ', shiftType: 'รุ่งอรุณ', slots: [
      { label: 'รุ่ง OPD', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'OPD' },
      { label: 'รุ่ง ER', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'ER' },
      { label: 'รุ่ง HIV', shiftType: 'รุ่งอรุณ', department: 'รุ่งอรุณ', position: 'HIV' },
    ]},
    { id: 'night', title: 'ดึก', shiftType: 'ดึก', slots: [
      { label: 'ดึก ER', shiftType: 'ดึก', department: 'ER', index: 0 },
    ]},
  ];
}

function resolveSlotState(slot: SlotConfig, day: CalendarDay, pendingAdds: PendingAdd[]) {
  if (slot.position) {
    const exactShift = day.shifts.find(
      (item) =>
        item.shift_type === slot.shiftType &&
        getDeptName(item) === slot.department &&
        ((item.position || '') === slot.position || (slot.legacyPositions?.includes(item.position || '') ?? false)),
    );
    const isIndexedPosition = slot.index !== undefined && slot.roleGroup !== undefined;
    const countPriorExactShifts = () => {
      if (!isIndexedPosition) return 0;
      let count = 0;
      for (let index = 0; index < (slot.index ?? 0); index += 1) {
        const priorPosition = getIndexedSlotPosition({
          roleGroup: slot.roleGroup,
          shiftType: slot.shiftType,
          department: slot.department,
          index,
        });
        const hasPriorExactShift = day.shifts.some(
          (item) =>
            item.shift_type === slot.shiftType &&
            getDeptName(item) === slot.department &&
            (item.position || '') === priorPosition,
        );
        if (!hasPriorExactShift) count += 1;
      }
      return count;
    };

    const matchingLegacyShifts = isIndexedPosition ? day.shifts
      .filter(
        (item) =>
          item.shift_type === slot.shiftType &&
          getDeptName(item) === slot.department &&
          !(item.position || ''),
      )
      .sort(sortShiftsForSlot) : [];
    const shift = exactShift || matchingLegacyShifts[countPriorExactShifts()];

    const exactPendingEntry = pendingAdds
      .map((add, globalIndex) => ({ add, globalIndex }))
      .find(
        ({ add }) =>
          add.date === format(day.date, 'yyyy-MM-dd') &&
          add.shift_type === slot.shiftType &&
          add.department === slot.department &&
          (add.position || '') === slot.position,
      );
    const matchingLegacyPending = isIndexedPosition ? pendingAdds
      .map((add, globalIndex) => ({ add, globalIndex }))
      .filter(
        ({ add }) =>
          add.date === format(day.date, 'yyyy-MM-dd') &&
          add.shift_type === slot.shiftType &&
          add.department === slot.department &&
          !add.position,
      ) : [];
    const pendingEntry = !shift
      ? exactPendingEntry || matchingLegacyPending[slot.index ?? 0]
      : undefined;

    return { shift, pendingEntry, canAdd: !shift && !pendingEntry };
  }

  const matchingShifts = day.shifts
    .filter((item) => item.shift_type === slot.shiftType && getDeptName(item) === slot.department)
    .sort(sortShiftsForSlot);

  const matchingPending = pendingAdds
    .map((add, globalIndex) => ({ add, globalIndex }))
    .filter(
      ({ add }) =>
        add.date === format(day.date, 'yyyy-MM-dd') &&
        add.shift_type === slot.shiftType &&
        add.department === slot.department &&
        !add.position,
    );

  const index = slot.index ?? 0;
  const shift = matchingShifts[index];
  const pendingEntry = !shift ? matchingPending[index - matchingShifts.length] : undefined;
  const canAdd = !shift && !pendingEntry && index >= matchingShifts.length + matchingPending.length;

  return { shift, pendingEntry, canAdd };
}

export function MobileEditDayModal({
  day,
  roleGroup,
  pendingDeletes,
  pendingEdits,
  pendingAdds,
  onClose,
  onToggleDelete,
  onEditShift,
  onAddShift,
  onRemovePendingAdd,
}: MobileEditDayModalProps) {
  const sections = buildSections(day, roleGroup);
  const dateLabel = format(day.date, "EEEE d MMMM yyyy", { locale: th });
  const dateKey = format(day.date, 'yyyy-MM-dd');

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-[24px] shadow-2xl w-full h-[85vh] max-h-[85vh] overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-3.5 pb-2.5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-violet-600">โหมดแก้ไขเวร</p>
              <h2 className="text-lg font-bold text-gray-900">{format(day.date, 'd MMMM', { locale: th })}</h2>
              <p className="text-xs text-gray-500">{dateLabel}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-500 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-semibold">{day.shifts.length} เวร</span>
            {pendingAdds.some((add) => add.date === dateKey) && (
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-semibold">เพิ่มรอ {pendingAdds.filter((add) => add.date === dateKey).length}</span>
            )}
            {day.shifts.some((shift) => pendingDeletes.has(shift.id) || pendingEdits[shift.id]) && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">มีรายการรอ</span>
            )}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)]"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {sections.map((section) => {
            const cfg = SHIFT_CONFIG[section.shiftType];
            return (
              <section key={section.id} className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                <div
                  className="px-3 py-2 flex items-center gap-1.5"
                  style={{ backgroundColor: `${cfg.color}14` }}
                >
                  <span className="text-sm">{cfg.icon}</span>
                  <h3 className="text-sm font-bold" style={{ color: cfg.color }}>{section.title}</h3>
                </div>

                <div className="p-2.5 space-y-1.5">
                  {section.slots.map((slot) => {
                    const { shift, pendingEntry, canAdd } = resolveSlotState(slot, day, pendingAdds);
                    const isPendingDelete = shift ? pendingDeletes.has(shift.id) : false;
                    const pendingEdit = shift ? pendingEdits[shift.id] : undefined;

                    return (
                      <div key={`${section.id}-${slot.label}`} className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-bold leading-tight text-gray-900">{slot.label}</p>
                            <p className="text-[10px] text-gray-500">{slot.department}{slot.position ? ` / ${slot.position}` : ''}</p>
                          </div>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200 shrink-0">
                            {slot.shiftType}
                          </span>
                        </div>

                        {shift && (
                          <div className={cn(
                            'mt-2 rounded-xl border p-2.5 bg-white',
                            isPendingDelete ? 'border-red-200 bg-red-50/70' : pendingEdit ? 'border-indigo-200 bg-indigo-50/70' : 'border-gray-200',
                          )}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className={cn('text-[13px] font-bold leading-tight text-gray-900', isPendingDelete && 'line-through text-red-500')}>
                                  {getUserName(shift)}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  {pendingEdit ? `เปลี่ยนเป็น ${pendingEdit.nickname || pendingEdit.f_name}` : 'แตะปุ่มด้านล่างเพื่อแก้ไข'}
                                </p>
                              </div>
                              {isPendingDelete && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold shrink-0">รอลบ</span>
                              )}
                              {!isPendingDelete && pendingEdit && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold shrink-0">รอเปลี่ยน</span>
                              )}
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => onEditShift(shift)}
                                className="flex items-center justify-center gap-1 rounded-lg bg-indigo-600 text-white py-2 text-[12px] font-semibold"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                เปลี่ยน
                              </button>
                              <button
                                onClick={() => onToggleDelete(shift.id)}
                                className={cn(
                                  'flex items-center justify-center gap-1 rounded-lg py-2 text-[12px] font-semibold border',
                                  isPendingDelete
                                    ? 'bg-white text-red-700 border-red-200'
                                    : 'bg-red-50 text-red-700 border-red-200',
                                )}
                              >
                                {isPendingDelete ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                                {isPendingDelete ? 'คืนค่า' : 'ลบ'}
                              </button>
                            </div>
                          </div>
                        )}

                        {pendingEntry && (
                          <div className="mt-2 rounded-xl border border-green-200 bg-green-50 p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[13px] font-bold leading-tight text-green-900">{pendingEntry.add.user.nickname || pendingEntry.add.user.f_name}</p>
                                <p className="text-[10px] text-green-700">รายการเพิ่มเวรรออยู่</p>
                              </div>
                              <button
                                onClick={() => onRemovePendingAdd(pendingEntry.globalIndex)}
                                className="px-2.5 py-1.5 rounded-lg bg-white text-red-600 border border-red-200 text-[12px] font-semibold shrink-0"
                              >
                                ลบ
                              </button>
                            </div>
                          </div>
                        )}

                        {!shift && !pendingEntry && canAdd && !slot.readOnly && (
                          <button
                            onClick={() => onAddShift({ date: dateKey, shift_type: slot.shiftType, department: slot.department, position: slot.position || '' })}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-green-300 bg-green-50 py-2.5 text-[12px] font-semibold text-green-700"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            เพิ่มลงช่องนี้
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
