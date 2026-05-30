import type { Shift, UserRole } from './types';

export type StaffCompensationRole = Exclude<UserRole, 'admin'>;

export type CompensationCategoryKey =
  | 'rung_arun'
  | 'project'
  | 'regular'
  | 'smc'
  | 'chemo';

export type CompensationRatesMap = Record<
  CompensationCategoryKey,
  Record<StaffCompensationRole, number>
>;

export type CompensationRateRow = {
  category: CompensationCategoryKey;
  role: StaffCompensationRole;
  rate: number;
};

export type CompensationCategory = {
  key: CompensationCategoryKey;
  name: string;
  rateLabel: string;
  unitLabel: string;
  unitValue: number;
  filter: (shift: Shift) => boolean;
  color: string;
};

export const STAFF_COMPENSATION_ROLES: StaffCompensationRole[] = [
  'pharmacist',
  'pharmacy_technician',
  'officer',
];

export const COMPENSATION_ROLE_LABELS: Record<StaffCompensationRole, string> = {
  pharmacist: 'เภสัชกร',
  pharmacy_technician: 'เจ้าพนักงานเภสัชกรรม',
  officer: 'เจ้าหน้าที่',
};

function getDeptName(shift: Shift) {
  return shift.department?.name || shift.department_name || '';
}

export const COMPENSATION_CATEGORIES: CompensationCategory[] = [
  {
    key: 'rung_arun',
    name: 'เวรรุ่งอรุณ',
    rateLabel: 'อัตรา/ชม.',
    unitLabel: 'ชั่วโมง',
    unitValue: 1.5,
    filter: (s) => s.shift_type === 'รุ่งอรุณ',
    color: 'bg-orange-50 text-orange-700 border-orange-100',
  },
  {
    key: 'project',
    name: 'เวรโครงการพิเศษ',
    rateLabel: 'อัตรา/ชม.',
    unitLabel: 'ชั่วโมง',
    unitValue: 4,
    filter: (s) => getDeptName(s) === 'โครงการ',
    color: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  {
    key: 'regular',
    name: 'เช้า-บ่าย-ดึก',
    rateLabel: 'อัตรา/เวร',
    unitLabel: 'เวร',
    unitValue: 1,
    filter: (s) =>
      ['เช้า', 'บ่าย', 'ดึก'].includes(s.shift_type) &&
      !['โครงการ', 'SMC', 'Chemo'].includes(getDeptName(s)),
    color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  {
    key: 'smc',
    name: 'พิเศษ SMC',
    rateLabel: 'อัตรา/เวร',
    unitLabel: 'เวร',
    unitValue: 1,
    filter: (s) => getDeptName(s) === 'SMC',
    color: 'bg-pink-50 text-pink-700 border-pink-100',
  },
  {
    key: 'chemo',
    name: 'งานเคมีบำบัด (Chemo)',
    rateLabel: 'อัตรา/เวร',
    unitLabel: 'เวร',
    unitValue: 1,
    filter: (s) => getDeptName(s) === 'Chemo',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
];

export const DEFAULT_COMPENSATION_RATES: CompensationRatesMap = {
  rung_arun: {
    pharmacist: 135,
    pharmacy_technician: 90,
    officer: 56.25,
  },
  project: {
    pharmacist: 135,
    pharmacy_technician: 90,
    officer: 56.25,
  },
  regular: {
    pharmacist: 780,
    pharmacy_technician: 520,
    officer: 330,
  },
  smc: {
    pharmacist: 900,
    pharmacy_technician: 600,
    officer: 375,
  },
  chemo: {
    pharmacist: 390,
    pharmacy_technician: 390,
    officer: 390,
  },
};

export function isCompensationCategoryKey(value: string): value is CompensationCategoryKey {
  return COMPENSATION_CATEGORIES.some((category) => category.key === value);
}

export function isStaffCompensationRole(value: string): value is StaffCompensationRole {
  return STAFF_COMPENSATION_ROLES.includes(value as StaffCompensationRole);
}

export function normalizeCompensationRates(rows?: Partial<CompensationRateRow>[] | null): CompensationRatesMap {
  const normalized = COMPENSATION_CATEGORIES.reduce((acc, category) => {
    acc[category.key] = { ...DEFAULT_COMPENSATION_RATES[category.key] };
    return acc;
  }, {} as CompensationRatesMap);

  for (const row of rows || []) {
    if (!row.category || !row.role) continue;
    if (!isCompensationCategoryKey(row.category) || !isStaffCompensationRole(row.role)) continue;

    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate < 0) continue;
    normalized[row.category][row.role] = rate;
  }

  return normalized;
}

export function compensationRatesToRows(rates: CompensationRatesMap): CompensationRateRow[] {
  return COMPENSATION_CATEGORIES.flatMap((category) =>
    STAFF_COMPENSATION_ROLES.map((role) => ({
      category: category.key,
      role,
      rate: rates[category.key][role],
    })),
  );
}

export function getCompensationRate(
  rates: CompensationRatesMap,
  category: CompensationCategoryKey,
  role: string | null | undefined,
) {
  const staffRole = role && isStaffCompensationRole(role) ? role : 'pharmacist';
  return rates[category]?.[staffRole] ?? DEFAULT_COMPENSATION_RATES[category][staffRole];
}
