export type ShiftSlotLike = {
  date?: string | null;
  shift_type?: string | null;
  shiftType?: string | null;
  department?: string | null;
  departmentName?: string | null;
  position?: string | null;
  user_id?: string | null;
  userId?: string | null;
};

export const AFTERNOON_MED_SLOT_FULL_MESSAGE =
  'เวรบ่าย MED รับได้แค่ 1 คนต่อวันในแต่ละกลุ่มตำแหน่ง';

export const DUPLICATE_SHIFT_MESSAGE =
  'รายการเวรนี้ถูกเพิ่มไว้แล้ว กรุณารอระบบตอบกลับหรือรีเฟรชแล้วลองอีกครั้ง';

export function normalizeShiftPosition(position?: string | null) {
  return (position ?? '').trim();
}

export function normalizeDepartmentName(name?: string | null) {
  return (name ?? '').trim();
}

export function getSlotShiftType(slot: ShiftSlotLike) {
  return (slot.shift_type ?? slot.shiftType ?? '').trim();
}

export function getSlotDepartmentName(slot: ShiftSlotLike) {
  return normalizeDepartmentName(slot.department ?? slot.departmentName);
}

export function isAfternoonMedSlot(slot: ShiftSlotLike) {
  return getSlotShiftType(slot) === 'บ่าย' && getSlotDepartmentName(slot).toUpperCase() === 'MED';
}

export function shiftSlotKey(slot: ShiftSlotLike) {
  return [
    slot.date ?? '',
    getSlotShiftType(slot),
    getSlotDepartmentName(slot).toUpperCase(),
    normalizeShiftPosition(slot.position),
  ].join('|');
}

export function userShiftSlotKey(slot: ShiftSlotLike) {
  return [
    slot.user_id ?? slot.userId ?? '',
    shiftSlotKey(slot),
  ].join('|');
}

export function afternoonMedSlotKey(slot: ShiftSlotLike, role?: string | null) {
  return [
    role ?? '',
    slot.date ?? '',
    'บ่าย',
    'MED',
  ].join('|');
}
