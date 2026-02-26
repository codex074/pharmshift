// TypeScript interfaces for เวรดี๊ดี

export interface User {
  id: string;
  auth_id?: string;
  pha_id?: string;             // e.g. 'pha208' — permanent staff ID
  name: string;
  fullname?: string;
  nickname?: string;
  prefix?: string; // ภก. or ภญ.
  role: 'pharmacist' | 'admin';
  profile_image?: 'male' | 'female';
  password?: string;           // plain-text copy stored in DB
  must_change_password?: boolean;
  created_at?: string;
}

export interface Department {
  id: number;
  name: string;
}

export interface Shift {
  id: string;
  date: string; // ISO date: "YYYY-MM-DD"
  department_id: number;
  department?: Department;
  department_name?: string;    // from view join
  shift_type: ShiftType;
  position?: string;           // e.g. 'Cont', 'D/C', 'OPD', 'ER', 'HIV'
  user_id: string;
  user?: User;
  user_nickname?: string;      // from view join
  user_name?: string;
  user_prefix?: string;
  month_year?: string;
  created_at?: string;
}

export interface SwapRequest {
  id: string;
  shift_id: string;
  shift?: Shift;
  requester_id: string;
  requester?: User;
  target_user_id: string;
  target_user?: User;
  request_type: 'swap' | 'transfer';
  target_shift_id?: string;
  target_shift?: Shift;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarDay {
  date: Date;
  shifts: Shift[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

export type ShiftType = 'เช้า' | 'บ่าย' | 'ดึก' | 'รุ่งอรุณ';

// ─── Shift Structure Config ─────────────────────────

export interface SlotDef {
  dept: string;
  count: number;
  position?: string;  // e.g. 'Cont', 'D/C'
  time: string;       // e.g. '08:30-16:30'
}

/** Returns the expected shift slots for a given date */
export function getSlotsForDate(date: Date): { shift: ShiftType; slots: SlotDef[] }[] {
  const dow = date.getDay(); // 0=Sun, 1=Mon...6=Sat
  const isWeekend = dow === 0 || dow === 6;
  // TODO: public holiday check can be added later
  const isHoliday = isWeekend;

  const result: { shift: ShiftType; slots: SlotDef[] }[] = [];

  // ─── เช้า (holidays only) ───
  if (isHoliday) {
    result.push({
      shift: 'เช้า',
      slots: [
        { dept: 'ER',      count: 1, time: '08:30-16:30' },
        { dept: 'SURG',    count: 2, time: '08:30-16:30' },
        { dept: 'โครงการ',  count: 1, time: '09:00-13:00' },
        { dept: 'MED',     count: 1, position: 'D/C',  time: '08:30-16:30' },
        { dept: 'MED',     count: 1, position: 'Cont', time: '08:30-16:30' },
        { dept: 'Chemo',   count: 2, time: '08:30-12:30' },
      ],
    });
  }

  // ─── บ่าย ───
  if (isHoliday) {
    result.push({
      shift: 'บ่าย',
      slots: [
        { dept: 'MED', count: 1, time: '16:30-23:59' },
        { dept: 'ER',  count: 1, time: '16:30-23:59' },
      ],
    });
  } else {
    const baiSlots: SlotDef[] = [
      { dept: 'โครงการ', count: 1, time: '16:30-20:30' },
      { dept: 'MED',    count: 1, time: '16:30-23:59' },
      { dept: 'ER',     count: 1, time: '16:30-23:59' },
    ];
    // SMC: Mon-Thu only (dow 1-4)
    if (dow >= 1 && dow <= 4) {
      baiSlots.push({ dept: 'SMC', count: 2, time: '16:30-20:30' });
    }
    result.push({ shift: 'บ่าย', slots: baiSlots });
  }

  // ─── ดึก (every day) ───
  result.push({
    shift: 'ดึก',
    slots: [
      { dept: 'ER', count: 1, time: '00:00-08:30' },
    ],
  });

  // ─── รุ่งอรุณ (weekdays only) ───
  if (!isWeekend) {
    const rungSlots: SlotDef[] = [
      { dept: 'รุ่งอรุณ', count: 1, position: 'OPD', time: '07:00-08:30' }, // Mon-Fri
    ];
    // Tue-Fri (dow 2-5)
    if (dow >= 2 && dow <= 5) {
      rungSlots.push({ dept: 'รุ่งอรุณ', count: 1, position: 'ER', time: '07:00-08:30' });
    }
    // Tue only (dow 2)
    if (dow === 2) {
      rungSlots.push({ dept: 'รุ่งอรุณ', count: 1, position: 'HIV', time: '07:00-08:30' });
    }
    result.push({ shift: 'รุ่งอรุณ', slots: rungSlots });
  }

  return result;
}

// ─── Colors ─────────────────────────

export const DEPT_COLORS: Record<string, string> = {
  'โครงการ':  '#22c55e',
  SURG:    '#ec4899',
  MED:     '#3b82f6',
  ER:      '#ef4444',
  SMC:     '#a855f7',
  รุ่งอรุณ: '#f97316',
  Chemo:   '#14b8a6',
};

export const SHIFT_CONFIG: Record<ShiftType, { icon: string; color: string; label: string; time: string }> = {
  เช้า:    { icon: '🌅', color: '#f59e0b', label: 'เช้า',    time: '08:30-16:30' },
  บ่าย:    { icon: '☀️', color: '#0ea5e9', label: 'บ่าย',    time: '16:30-23:59' },
  ดึก:     { icon: '🌙', color: '#6366f1', label: 'ดึก',     time: '00:00-08:30' },
  รุ่งอรุณ: { icon: '🌄', color: '#f97316', label: 'รุ่งอรุณ', time: '07:00-08:30' },
};

// Keep legacy exports for backward compat
export const DEPT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'โครงการ':   { bg: 'dept-project', text: 'text-green-700',  label: 'โครงการ' },
  SURG:     { bg: 'dept-surg',    text: 'text-pink-700',   label: 'SURG' },
  MED:      { bg: 'dept-med',     text: 'text-blue-700',   label: 'MED' },
  ER:       { bg: 'dept-er',      text: 'text-red-700',    label: 'ER' },
  SMC:      { bg: 'dept-smc',     text: 'text-purple-700', label: 'SMC' },
  รุ่งอรุณ:  { bg: 'dept-rung',    text: 'text-orange-700', label: 'รุ่งอรุณ' },
  Chemo:    { bg: 'dept-chemo',   text: 'text-teal-700',   label: 'Chemo' },
};

export const SHIFT_STYLES: Record<string, { badge: string; label: string; icon: string }> = {
  เช้า:    { badge: 'badge-chao', label: 'เช้า',    icon: '🌅' },
  บ่าย:    { badge: 'badge-bai',  label: 'บ่าย',    icon: '☀️' },
  ดึก:     { badge: 'badge-duek', label: 'ดึก',     icon: '🌙' },
  รุ่งอรุณ: { badge: 'badge-rung', label: 'รุ่งอรุณ', icon: '🌄' },
};
