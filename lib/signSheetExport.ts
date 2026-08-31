import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Shift } from './types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

function getDeptName(s: Shift) {
  return s.department?.name || s.department_name || '';
}

interface UserInfo {
  id: string;
  f_name: string;
  l_name: string;
  nickname?: string;
  prefix: string;
  role: string;
  pha_id: string | number;
}

/** Build map: shift_id → original user_id (from original_user_id column, falls back to user_id) */
function buildOriginalUserMap(shifts: Shift[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of shifts) {
    map.set(s.id, s.original_user_id || s.user_id!);
  }
  return map;
}

const ROLE_ORDER = ['pharmacist', 'pharmacy_technician', 'officer'];

function sortByRole(a: Shift, b: Shift) {
  const ra = ROLE_ORDER.indexOf(a.user?.role || '');
  const rb = ROLE_ORDER.indexOf(b.user?.role || '');
  if (ra !== rb) return ra - rb;
  const pa = Number(a.user?.pha_id || 9999);
  const pb = Number(b.user?.pha_id || 9999);
  return pa - pb;
}

type Layout = 'simple' | 'with-subtype' | 'chemo';

interface SheetConfig {
  name: string;
  title: (monthName: string, bweYear: number) => string;
  filter: (s: Shift) => boolean;
  layout: Layout;
  getSubtype?: (s: Shift) => string;
  subtypeLabel?: string;
  advanceDukDate?: boolean; // default true — set false to keep ดึก at original date
  minRows?: number;         // minimum rows per day group (default 1)
  sortPositions?: string[]; // sort positions in this order within each group
  buildCustomGroups?: (    // bypass buildGroups' generic filter/role logic entirely
    shifts: Shift[],
    originalUserMap: Map<string, string>,
    usersMap: Map<string, UserInfo>
  ) => RowGroup[];
}

const SHEET_CONFIGS: SheetConfig[] = [
  {
    name: 'รุ่งอรุณ OPD',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรรุ่งอรุณ OPD เดือน ${m} ${y}`,
    filter: (s) => s.shift_type === 'รุ่งอรุณ' && s.position !== 'ER',
    layout: 'simple',
    minRows: 2,
    sortPositions: ['OPD', 'รo1', 'รo2', 'HIV'],
  },
  {
    name: 'รุ่งอรุณ ER',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรรุ่งอรุณ ER เดือน ${m} ${y}`,
    filter: (s) => s.shift_type === 'รุ่งอรุณ' && s.position === 'ER',
    layout: 'simple',
  },
  {
    name: 'เช้า IPD',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรห้องยาอายุรกรรม(IPD)เช้า เดือน ${m} ${y}`,
    filter: (s) => s.shift_type === 'เช้า' && (getDeptName(s) === 'MED' || getDeptName(s) === 'SURG'),
    layout: 'simple',
    buildCustomGroups: buildIpdMorningGroups,
  },
  {
    name: 'ER',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรเดือน ${m} ${y} ( ห้องยา ER )`,
    filter: (s) => getDeptName(s) === 'ER',
    layout: 'with-subtype',
    getSubtype: (s) => s.shift_type,
    subtypeLabel: 'เวร',
  },
  {
    name: 'โครงการ',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรเดือน ${m} ${y} (เวร โครงการ)`,
    filter: (s) => getDeptName(s) === 'โครงการ',
    layout: 'simple',
    minRows: 2,
  },
  {
    name: 'บ่าย IPD',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรเดือน ${m} ${y} เวรบ่าย IPD เวลา 16.30 – 24.00 น.`,
    filter: (s) => s.shift_type === 'บ่าย' && getDeptName(s) === 'MED',
    layout: 'simple',
  },
  {
    name: 'SMC',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรห้องยา SMC เดือน ${m} ${y}`,
    filter: (s) => getDeptName(s) === 'SMC',
    layout: 'simple',
  },
  {
    name: 'Chemo',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวร Chemo เดือน ${m} ${y}`,
    filter: (s) => getDeptName(s) === 'Chemo',
    layout: 'chemo',
  },
];

// Column definitions per layout
// simple: A=date, B=pharm, C=pt, D=officer, E=gap, F=pharm(s), G=pt(s), H=officer(s), I=approve, J=pharm(a), K=pt(a), L=officer(a)
// with-subtype: A=date, B=subtype, C=pharm, D=pt, E=officer, F=gap, G=pharm(s), H=pt(s), I=officer(s), J=approve, K=pharm(a), L=pt(a), M=officer(a)

const THIN: Partial<ExcelJS.BorderStyle> = 'thin';
const border = (sides: ('top' | 'bottom' | 'left' | 'right')[]): Partial<ExcelJS.Borders> => {
  const b: Partial<ExcelJS.Borders> = {};
  for (const s of sides) b[s] = { style: THIN };
  return b;
};
const ALL_BORDERS = border(['top', 'bottom', 'left', 'right']);
const FONT = { name: 'TH SarabunPSK', size: 16 };
const FONT_BOLD = { name: 'TH SarabunPSK', size: 16, bold: true };
const FONT_TITLE = { name: 'TH SarabunPSK', size: 18, bold: true };
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
const LEFT: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle' };

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr);
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543 - 2500}`;
}

function formatThaiDateWithHyphen(dateStr: string): string {
  const d = new Date(dateStr);
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()}-${thMonths[d.getMonth()]}-${d.getFullYear() + 543 - 2500}`;
}

interface RowGroup {
  date: string;
  subtype?: string;
  pharmacists: string[];
  pharm_techs: string[];
  officers: string[];
  chemoNames: string[];
}

function getDisplayName(userInfo: UserInfo | undefined, shift: Shift): string {
  const orig = shift.original_user || shift.user;
  return userInfo?.f_name
    || orig?.f_name
    || shift.user_f_name
    || userInfo?.nickname
    || orig?.nickname
    || shift.user_nickname
    || '-';
}

function buildGroups(
  shifts: Shift[],
  config: SheetConfig,
  originalUserMap: Map<string, string>,
  usersMap: Map<string, UserInfo>
): RowGroup[] {
  let filtered = shifts.filter(config.filter);

  if (config.sortPositions) {
    const posOrd = config.sortPositions;
    filtered = [...filtered].sort((a, b) => {
      const pa = posOrd.indexOf(a.position || '');
      const pb = posOrd.indexOf(b.position || '');
      const ia = pa === -1 ? posOrd.length : pa;
      const ib = pb === -1 ? posOrd.length : pb;
      if (ia !== ib) return ia - ib;
      return sortByRole(a, b);
    });
  }

  // Build grouping key
  const groupMap = new Map<string, RowGroup>();

  for (const s of filtered) {
    const origId = originalUserMap.get(s.id) || s.user_id!;
    const userInfo = usersMap.get(origId);
    const displayName = getDisplayName(userInfo, s);
    const role = userInfo?.role || s.original_user?.role || s.user?.role || 'officer';

    let effectiveDate = s.date;
    if (s.shift_type === 'ดึก' && config.advanceDukDate !== false) {
      const d = new Date(s.date);
      d.setDate(d.getDate() + 1);
      effectiveDate = d.toISOString().slice(0, 10);
    }

    const subtype = config.getSubtype ? config.getSubtype(s) : '';
    const key = config.layout === 'with-subtype'
      ? `${effectiveDate}__${subtype}`
      : effectiveDate; // simple groups by date only

    if (!groupMap.has(key)) {
      groupMap.set(key, { date: effectiveDate, subtype, pharmacists: [], pharm_techs: [], officers: [], chemoNames: [] });
    }
    const grp = groupMap.get(key)!;
    if (config.layout === 'chemo') grp.chemoNames.push(displayName);
    else if (role === 'pharmacist') grp.pharmacists.push(displayName);
    else if (role === 'pharmacy_technician') grp.pharm_techs.push(displayName);
    else grp.officers.push(displayName);
  }

  // Sort keys by date then subtype
  const SHIFT_ORDER = ['ดึก', 'เช้า', 'บ่าย'];
  return Array.from(groupMap.entries())
    .sort(([ka], [kb]) => {
      const [da, sa] = ka.split('__');
      const [db, sb] = kb.split('__');
      if (da !== db) return da.localeCompare(db);
      return (SHIFT_ORDER.indexOf(sa) - SHIFT_ORDER.indexOf(sb));
    })
    .map(([, v]) => v);
}

/**
 * Mirrors buildIndexedSlots() in components/calendar/CalendarGrid.tsx: match each
 * position exactly first, then hand any leftover *blank*-position shift (the old,
 * pre-index format) to the remaining slots in creation order. Needed because
 * pharmacist's dept-SURG legacy shifts (pre Aug-26 four-slot merge) may carry no
 * position at all.
 */
function resolveIndexedLegacy(dateShifts: Shift[], positions: string[]): (Shift | null)[] {
  const usedIds = new Set<string>();
  return positions.map((position) => {
    const exact = dateShifts.find((s) => s.position === position && !usedIds.has(s.id));
    if (exact) {
      usedIds.add(exact.id);
      return exact;
    }
    const legacyPool = dateShifts
      .filter((s) => !s.position && !usedIds.has(s.id))
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const legacy = legacyPool[0];
    if (legacy) {
      usedIds.add(legacy.id);
      return legacy;
    }
    return null;
  });
}

/**
 * เช้า IPD sign sheet — pharmacist (DC/M1/M2/M3, dept MED), pharmacy_technician
 * (m1/m2 dept MED + s1/s2 dept SURG → I1-I4) and officer (s1/s2/s3 dept SURG →
 * S1-S3, m1-m4 dept MED → I1-I4) slots are all folded into one "IPD" sheet per
 * lib/types.ts's PHARM_TECH_IPD_POSITION_MAP / officer m1-m4+s1-s3 grouping —
 * each role keeps its own fixed slot order and count instead of being aligned
 * to a single shared row, since the three roles don't share slot labels 1:1.
 */
function buildIpdMorningGroups(
  shifts: Shift[],
  originalUserMap: Map<string, string>,
  usersMap: Map<string, UserInfo>
): RowGroup[] {
  const relevant = shifts.filter(
    (s) => s.shift_type === 'เช้า' && (getDeptName(s) === 'MED' || getDeptName(s) === 'SURG')
  );

  const roleOf = (s: Shift) => {
    const origId = originalUserMap.get(s.id) || s.user_id!;
    const userInfo = usersMap.get(origId);
    return userInfo?.role || s.original_user?.role || s.user?.role || 'officer';
  };
  const nameOf = (s: Shift) => {
    const origId = originalUserMap.get(s.id) || s.user_id!;
    return getDisplayName(usersMap.get(origId), s);
  };

  // getIndexedSlotPosition (lib/shiftSlotRules.ts) hands out the same position string
  // (e.g. dept SURG position 's1', dept MED position 'm1') to both pharmacy_technician
  // and officer — role, not position, is what tells the two apart. Key by role too, or
  // one role's name silently overwrites the other's in byKey.
  const byKey = new Map<string, string>(); // `${date}__${role}__${dept}__${position}` -> display name
  const dates = new Set<string>();
  for (const s of relevant) {
    byKey.set(`${s.date}__${roleOf(s)}__${getDeptName(s)}__${s.position || ''}`, nameOf(s));
    dates.add(s.date);
  }

  const lookup = (date: string, role: string, dept: string, positions: string[]) =>
    positions.map((p) => byKey.get(`${date}__${role}__${dept}__${p}`)).find(Boolean) || '';

  // Before the Aug-26 four-slot merge, pharmacist's weekend/holiday IPD I2/I3 (M2/M3)
  // were written as separate dept-SURG shifts (position 's1'/'s2', or blank on older
  // data) — never rewritten, so old months still carry them under dept SURG. Resolve
  // that fallback the same way the calendar grid does, keyed per date.
  const pharmSurgByDate = new Map<string, Shift[]>();
  for (const s of relevant) {
    if (getDeptName(s) !== 'SURG' || roleOf(s) !== 'pharmacist') continue;
    if (!pharmSurgByDate.has(s.date)) pharmSurgByDate.set(s.date, []);
    pharmSurgByDate.get(s.date)!.push(s);
  }

  const TECH_SLOTS: string[][] = [
    ['MED', 'm1'],
    ['MED', 'm2'],
    ['SURG', 's1'],
    ['SURG', 's2'],
  ];
  const OFFICER_SLOTS: string[][] = [
    ['SURG', 's1'],
    ['SURG', 's2'],
    ['SURG', 's3'],
    ['MED', 'm1'],
    ['MED', 'm2'],
    ['MED', 'm3'],
    ['MED', 'm4'],
  ];

  return Array.from(dates)
    .sort()
    .map((date) => {
      const dc = lookup(date, 'pharmacist', 'MED', ['DC', 'D/C']);
      const i1 = lookup(date, 'pharmacist', 'MED', ['M1', 'Cont']);
      let i2 = lookup(date, 'pharmacist', 'MED', ['M2']);
      let i3 = lookup(date, 'pharmacist', 'MED', ['M3']);
      if (!i2 || !i3) {
        const [legacyI2, legacyI3] = resolveIndexedLegacy(pharmSurgByDate.get(date) || [], ['s1', 's2']);
        if (!i2 && legacyI2) i2 = nameOf(legacyI2);
        if (!i3 && legacyI3) i3 = nameOf(legacyI3);
      }

      return {
        date,
        pharmacists: [dc, i1, i2, i3],
        pharm_techs: TECH_SLOTS.map(([dept, ...pos]) => lookup(date, 'pharmacy_technician', dept, pos)),
        officers: OFFICER_SLOTS.map(([dept, ...pos]) => lookup(date, 'officer', dept, pos)),
        chemoNames: [],
      };
    });
}

function applySheetColumns(ws: ExcelJS.Worksheet, hasSubtype: boolean) {
  const cols = hasSubtype
    ? [10, 10, 14, 14, 14, 14, 14, 14, 10, 3, 10, 10, 14, 14, 14]
    : [10, 14, 14, 14, 14, 14, 14, 10, 3, 10, 14, 14, 14];
  ws.columns = cols.map((width) => ({ width }));
}

function applyChemoSheetColumns(ws: ExcelJS.Worksheet) {
  ws.columns = [13, 13, 13, 13, 13, 13, 10, 10].map((width) => ({ width }));
}

function styleHeaderRow(row: ExcelJS.Row, totalCols: number) {
  row.font = FONT_BOLD;
  row.alignment = CENTER;
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c <= totalCols) cell.border = ALL_BORDERS;
  });
}

function styleDataRow(row: ExcelJS.Row, totalCols: number, centeredCols: Set<number>) {
  row.height = 22;
  row.font = FONT;
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c <= totalCols) {
      cell.alignment = centeredCols.has(c) ? CENTER : LEFT;
      cell.border = ALL_BORDERS;
    }
  });
}

export async function exportSignSheet(
  shifts: Shift[],
  users: UserInfo[],
  year: number,
  month: number
) {
  const workbook = new ExcelJS.Workbook();
  const monthName = format(new Date(year, month - 1), 'MMMM', { locale: th });
  const bweYear = year + 543;

  const originalUserMap = buildOriginalUserMap(shifts);
  const usersMap = new Map<string, UserInfo>(users.map((u) => [u.id, u]));

  for (const config of SHEET_CONFIGS) {
    const hasSubtype = config.layout === 'with-subtype';
    const isChemo = config.layout === 'chemo';
    const totalCols = isChemo ? 8 : hasSubtype ? 15 : 13;
    const lastColLetter = isChemo ? 'H' : hasSubtype ? 'O' : 'M';

    const ws = workbook.addWorksheet(config.name, {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
        horizontalCentered: true,
      },
    });
    if (isChemo) applyChemoSheetColumns(ws);
    else applySheetColumns(ws, hasSubtype);

    // ── Title row ──────────────────────────────────────────────
    const titleRow = ws.addRow([config.title(monthName, bweYear)]);
    titleRow.height = 28;
    titleRow.font = FONT_TITLE;
    titleRow.alignment = CENTER;
    ws.mergeCells(`A${titleRow.number}:${lastColLetter}${titleRow.number}`);

    if (isChemo) {
      const spacerRow = ws.addRow([]);
      spacerRow.height = 12;

      const headerRow = ws.addRow(['ว/ด/ป', 'ชื่อ', 'ชื่อ', 'ยาน้ำ', 'ลงชื่อ', 'ลงชื่อ', 'case', 'ขวด']);
      headerRow.height = 24;
      styleHeaderRow(headerRow, totalCols);

      const groups = buildGroups(shifts, config, originalUserMap, usersMap);
      for (const grp of groups) {
        const dataRow = ws.addRow([
          formatThaiDateWithHyphen(grp.date),
          grp.chemoNames[0] || '',
          grp.chemoNames[1] || '',
          '',
          '',
          '',
          '',
          '',
        ]);
        dataRow.height = 22;
        dataRow.font = FONT;
        dataRow.eachCell({ includeEmpty: true }, (cell, c) => {
          if (c <= totalCols) {
            cell.alignment = c === 1 ? CENTER : LEFT;
            cell.border = ALL_BORDERS;
          }
        });
      }

      continue;
    }

    // ── Split-print header layout ──────────────────────────────
    const roleLabels = ['เภสัช', 'จพง.', 'จนท.'];
    const h1Values = new Array(totalCols).fill('');
    const h2Values = new Array(totalCols).fill('');
    h1Values[0] = 'ว/ด/ป';

    if (hasSubtype) {
      h1Values[1] = config.subtypeLabel || '';
      h1Values[2] = 'ผู้ปฏิบัติเวรเดิม';
      h1Values[5] = 'ผู้ขอแลกเวร\n(เจ้าของเวรเดิมเป็นผู้เซนต์)';
      h1Values[8] = 'ผู้อนุมัติ';
      h1Values[10] = 'ว/ด/ป';
      h1Values[11] = config.subtypeLabel || '';
      h1Values[12] = 'ผู้ปฏิบัติงานจริง';

      h2Values[2] = roleLabels[0]; h2Values[3] = roleLabels[1]; h2Values[4] = roleLabels[2];
      h2Values[5] = roleLabels[0]; h2Values[6] = roleLabels[1]; h2Values[7] = roleLabels[2];
      h2Values[12] = roleLabels[0]; h2Values[13] = roleLabels[1]; h2Values[14] = roleLabels[2];
    } else {
      h1Values[1] = 'ผู้ปฏิบัติเวรเดิม';
      h1Values[4] = 'ผู้ขอแลกเวร\n(เจ้าของเวรเดิมเป็นผู้เซนต์)';
      h1Values[7] = 'ผู้อนุมัติ';
      h1Values[9] = 'ว/ด/ป';
      h1Values[10] = 'ผู้ปฏิบัติงานจริง';

      h2Values[1] = roleLabels[0]; h2Values[2] = roleLabels[1]; h2Values[3] = roleLabels[2];
      h2Values[4] = roleLabels[0]; h2Values[5] = roleLabels[1]; h2Values[6] = roleLabels[2];
      h2Values[10] = roleLabels[0]; h2Values[11] = roleLabels[1]; h2Values[12] = roleLabels[2];
    }

    const h1 = ws.addRow(h1Values);
    h1.height = 30;
    styleHeaderRow(h1, totalCols);

    const h2 = ws.addRow(h2Values);
    h2.height = 22;
    styleHeaderRow(h2, totalCols);

    const r1 = h1.number;
    if (hasSubtype) {
      ws.mergeCells(r1, 1, r1 + 1, 1);
      ws.mergeCells(r1, 2, r1 + 1, 2);
      ws.mergeCells(r1, 3, r1, 5);
      ws.mergeCells(r1, 6, r1, 8);
      ws.mergeCells(r1, 9, r1 + 1, 9);
      ws.mergeCells(r1, 10, r1 + 1, 10);
      ws.mergeCells(r1, 11, r1 + 1, 11);
      ws.mergeCells(r1, 12, r1 + 1, 12);
      ws.mergeCells(r1, 13, r1, 15);
    } else {
      ws.mergeCells(r1, 1, r1 + 1, 1);
      ws.mergeCells(r1, 2, r1, 4);
      ws.mergeCells(r1, 5, r1, 7);
      ws.mergeCells(r1, 8, r1 + 1, 8);
      ws.mergeCells(r1, 10, r1 + 1, 10);
      ws.mergeCells(r1, 11, r1, 13);
    }

    // ── Data rows ──────────────────────────────────────────────
    const groups = config.buildCustomGroups
      ? config.buildCustomGroups(shifts, originalUserMap, usersMap)
      : buildGroups(shifts, config, originalUserMap, usersMap);

    // hasSubtype: merge date col across all shift types of the same day
    const dateSpans = new Map<string, { startRow: number; endRow: number }>();

    for (const grp of groups) {
      const maxRows = Math.max(grp.pharmacists.length, grp.pharm_techs.length, grp.officers.length, config.minRows ?? 1);
      const startRow = ws.lastRow!.number + 1;

      for (let i = 0; i < maxRows; i++) {
        const vals = new Array(totalCols).fill('');
        if (hasSubtype) {
          if (i === 0) {
            vals[0] = formatThaiDate(grp.date);
            vals[1] = grp.subtype || '';
            vals[10] = formatThaiDate(grp.date);
            vals[11] = grp.subtype || '';
          }
          vals[2] = grp.pharmacists[i] || '';
          vals[3] = grp.pharm_techs[i] || '';
          vals[4] = grp.officers[i] || '';
          // request / actual sections remain blank for printing and handwriting
        } else {
          if (i === 0) {
            vals[0] = formatThaiDate(grp.date);
            vals[9] = formatThaiDate(grp.date);
          }
          vals[1] = grp.pharmacists[i] || '';
          vals[2] = grp.pharm_techs[i] || '';
          vals[3] = grp.officers[i] || '';
        }

        const dataRow = ws.addRow(vals);
        styleDataRow(
          dataRow,
          totalCols,
          hasSubtype ? new Set([1, 2, 9, 10, 11, 12]) : new Set([1, 8, 9, 10])
        );
      }

      const endRow = startRow + maxRows - 1;

      // Merge within group: subtype label (hasSubtype) or date (simple)
      // For hasSubtype, cols 1/10/11 (date left, gap, date right) are deferred to cross-group below
      if (maxRows > 1) {
        if (hasSubtype) {
          ws.mergeCells(startRow, 2, endRow, 2); // subtype left only
        } else {
          ws.mergeCells(startRow, 1, endRow, 1);
          ws.mergeCells(startRow, 10, endRow, 10);
        }
      }

      // Accumulate date span for hasSubtype cross-group merge
      if (hasSubtype) {
        if (!dateSpans.has(grp.date)) {
          dateSpans.set(grp.date, { startRow, endRow });
        } else {
          dateSpans.get(grp.date)!.endRow = endRow;
        }
      }
    }

    // Merge date column across all shift types for hasSubtype (ER) layout
    if (hasSubtype) {
      Array.from(dateSpans.values()).forEach(({ startRow, endRow }) => {
        if (endRow > startRow) {
          ws.mergeCells(startRow, 1, endRow, 1);   // date left (col 1)
          ws.mergeCells(startRow, 10, endRow, 10); // gap (col 10)
          ws.mergeCells(startRow, 11, endRow, 11); // date right (col 11)
        }
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `ตารางเซนต์เวร_${monthName}_${bweYear}.xlsx`);
}
