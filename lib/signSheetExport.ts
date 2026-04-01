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

type Layout = 'simple' | 'with-subtype';

interface SheetConfig {
  name: string;
  title: (monthName: string, bweYear: number) => string;
  filter: (s: Shift) => boolean;
  layout: Layout;
  getSubtype?: (s: Shift) => string;
  subtypeLabel?: string;
}

const SHEET_CONFIGS: SheetConfig[] = [
  {
    name: 'รุ่งอรุณ',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรรุ่งอรุณ เดือน ${m} ${y}`,
    filter: (s) => s.shift_type === 'รุ่งอรุณ',
    layout: 'simple',
  },
  {
    name: 'เช้า MED',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรห้องยาอายุรกรรม(Med)เช้า เดือน ${m} ${y}`,
    filter: (s) => s.shift_type === 'เช้า' && getDeptName(s) === 'MED',
    layout: 'with-subtype',
    getSubtype: (s) => s.position || '',
    subtypeLabel: 'ตำแหน่ง',
  },
  {
    name: 'เช้า SURG',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรห้องยา Surg. เดือน ${m} ${y}`,
    filter: (s) => s.shift_type === 'เช้า' && getDeptName(s) === 'SURG',
    layout: 'simple',
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
  },
  {
    name: 'บ่าย MED',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรเดือน ${m} ${y} เวรบ่าย MED เวลา 16.30 – 24.00 น.`,
    filter: (s) => s.shift_type === 'บ่าย' && getDeptName(s) === 'MED',
    layout: 'simple',
  },
  {
    name: 'SMC',
    title: (m, y) => `ตารางเซ็นต์ชื่อแลกเวรห้องยา SMC เดือน ${m} ${y}`,
    filter: (s) => getDeptName(s) === 'SMC',
    layout: 'simple',
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

interface RowGroup {
  date: string;
  subtype?: string;
  pharmacists: string[];
  pharm_techs: string[];
  officers: string[];
}

function buildGroups(
  shifts: Shift[],
  config: SheetConfig,
  originalUserMap: Map<string, string>,
  usersMap: Map<string, UserInfo>
): RowGroup[] {
  const filtered = shifts.filter(config.filter);

  // Build grouping key
  const groupMap = new Map<string, RowGroup>();

  for (const s of filtered) {
    const origId = originalUserMap.get(s.id) || s.user_id!;
    const userInfo = usersMap.get(origId);
    const fName = userInfo?.f_name || s.user?.f_name || '-';
    const role = userInfo?.role || s.user?.role || 'officer';

    // เวรดึก ปฏิบัติงานถึง 08.30 ของวันถัดไป → แสดงวันที่ถัดไปในตาราง
    let effectiveDate = s.date;
    if (s.shift_type === 'ดึก') {
      const d = new Date(s.date);
      d.setDate(d.getDate() + 1);
      effectiveDate = d.toISOString().slice(0, 10);
    }

    const subtype = config.getSubtype ? config.getSubtype(s) : '';
    const key = config.layout === 'with-subtype'
      ? `${effectiveDate}__${subtype}`
      : effectiveDate;

    if (!groupMap.has(key)) {
      groupMap.set(key, { date: effectiveDate, subtype, pharmacists: [], pharm_techs: [], officers: [] });
    }
    const grp = groupMap.get(key)!;
    if (role === 'pharmacist') grp.pharmacists.push(fName);
    else if (role === 'pharmacy_technician') grp.pharm_techs.push(fName);
    else grp.officers.push(fName);
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

function applySheetColumns(ws: ExcelJS.Worksheet, hasSubtype: boolean) {
  const cols = hasSubtype
    ? [10, 8, 15, 15, 15, 3, 15, 15, 15, 8, 15, 15, 15]
    : [10, 15, 15, 15, 3, 15, 15, 15, 8, 15, 15, 15];
  ws.columns = cols.map((width) => ({ width }));
}

function styleHeaderRow(row: ExcelJS.Row, totalCols: number) {
  row.font = FONT_BOLD;
  row.alignment = CENTER;
  row.eachCell({ includeEmpty: true }, (cell, c) => {
    if (c <= totalCols) cell.border = ALL_BORDERS;
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
    const totalCols = hasSubtype ? 13 : 12;
    const lastColLetter = hasSubtype ? 'M' : 'L';

    const ws = workbook.addWorksheet(config.name, {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      },
    });
    applySheetColumns(ws, hasSubtype);

    // ── Title row ──────────────────────────────────────────────
    const titleRow = ws.addRow([config.title(monthName, bweYear)]);
    titleRow.height = 28;
    titleRow.font = FONT_TITLE;
    titleRow.alignment = CENTER;
    ws.mergeCells(`A${titleRow.number}:${lastColLetter}${titleRow.number}`);

    // ── Header row 1 ───────────────────────────────────────────
    const h1Values = new Array(totalCols).fill('');
    h1Values[0] = 'ว/ด/ป';
    if (hasSubtype) {
      h1Values[1] = config.subtypeLabel || '';
      h1Values[2] = 'ผู้ปฏิบัติเวรเดิม (ชื่อตามตารางเวรเดิม)';
      h1Values[6] = 'ผู้ขอแลกเวร\n(เจ้าของเวรเดิมเป็นผู้เซนต์)';
      h1Values[9] = 'ผู้อนุมัติ';
      h1Values[10] = 'ผู้ปฏิบัติงานจริง';
    } else {
      h1Values[1] = 'ผู้ปฏิบัติเวรเดิม (ชื่อตามตารางเวรเดิม)';
      h1Values[5] = 'ผู้ขอแลกเวร\n(เจ้าของเวรเดิมเป็นผู้เซนต์)';
      h1Values[8] = 'ผู้อนุมัติ';
      h1Values[9] = 'ผู้ปฏิบัติงานจริง';
    }

    const h1 = ws.addRow(h1Values);
    h1.height = 32;
    styleHeaderRow(h1, totalCols);

    const r1 = h1.number;
    if (hasSubtype) {
      ws.mergeCells(r1, 1, r1 + 1, 1); // ว/ด/ป
      ws.mergeCells(r1, 2, r1 + 1, 2); // subtype label
      ws.mergeCells(r1, 3, r1, 5);     // ผู้ปฏิบัติเวรเดิม
      ws.mergeCells(r1, 7, r1, 9);     // ผู้ขอแลกเวร
      ws.mergeCells(r1, 10, r1 + 1, 10); // ผู้อนุมัติ
      ws.mergeCells(r1, 11, r1, 13);   // ผู้ปฏิบัติงานจริง
    } else {
      ws.mergeCells(r1, 1, r1 + 1, 1); // ว/ด/ป
      ws.mergeCells(r1, 2, r1, 4);     // ผู้ปฏิบัติเวรเดิม
      ws.mergeCells(r1, 6, r1, 8);     // ผู้ขอแลกเวร
      ws.mergeCells(r1, 9, r1 + 1, 9); // ผู้อนุมัติ
      ws.mergeCells(r1, 10, r1, 12);   // ผู้ปฏิบัติงานจริง
    }

    // ── Header row 2 ───────────────────────────────────────────
    const roleLabels = ['เภสัช', 'จพง.', 'จนท.'];
    const h2Values = new Array(totalCols).fill('');
    if (hasSubtype) {
      h2Values[2] = roleLabels[0]; h2Values[3] = roleLabels[1]; h2Values[4] = roleLabels[2];
      h2Values[6] = roleLabels[0]; h2Values[7] = roleLabels[1]; h2Values[8] = roleLabels[2];
      h2Values[10] = roleLabels[0]; h2Values[11] = roleLabels[1]; h2Values[12] = roleLabels[2];
    } else {
      h2Values[1] = roleLabels[0]; h2Values[2] = roleLabels[1]; h2Values[3] = roleLabels[2];
      h2Values[5] = roleLabels[0]; h2Values[6] = roleLabels[1]; h2Values[7] = roleLabels[2];
      h2Values[9] = roleLabels[0]; h2Values[10] = roleLabels[1]; h2Values[11] = roleLabels[2];
    }

    const h2 = ws.addRow(h2Values);
    h2.height = 22;
    styleHeaderRow(h2, totalCols);

    // ── Data rows ──────────────────────────────────────────────
    const groups = buildGroups(shifts, config, originalUserMap, usersMap);

    for (const grp of groups) {
      const maxRows = Math.max(grp.pharmacists.length, grp.pharm_techs.length, grp.officers.length, 1);
      const startRow = ws.lastRow!.number + 1;

      for (let i = 0; i < maxRows; i++) {
        const vals = new Array(totalCols).fill('');
        if (i === 0) vals[0] = formatThaiDate(grp.date);

        if (hasSubtype) {
          if (i === 0) vals[1] = grp.subtype || '';
          vals[2] = grp.pharmacists[i] || '';
          vals[3] = grp.pharm_techs[i] || '';
          vals[4] = grp.officers[i] || '';
        } else {
          vals[1] = grp.pharmacists[i] || '';
          vals[2] = grp.pharm_techs[i] || '';
          vals[3] = grp.officers[i] || '';
        }

        const dataRow = ws.addRow(vals);
        dataRow.height = 22;
        dataRow.font = FONT;
        dataRow.eachCell({ includeEmpty: true }, (cell, c) => {
          if (c <= totalCols) {
            cell.alignment = c === 1 ? CENTER : LEFT;
            cell.border = ALL_BORDERS;
          }
        });
      }

      // Merge date column vertically if multiple rows
      if (maxRows > 1) {
        const endRow = startRow + maxRows - 1;
        ws.mergeCells(startRow, 1, endRow, 1);
        if (hasSubtype) ws.mergeCells(startRow, 2, endRow, 2); // merge subtype for ER
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `ตารางเซนต์เวร_${monthName}_${bweYear}.xlsx`);
}
