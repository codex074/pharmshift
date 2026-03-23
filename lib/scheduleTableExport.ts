import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Shift, Holiday } from './types';
import { THAI_MONTHS } from './utils';

// Column layout: Sun(A-E)=5, Mon(F-I)=4, Tue(J-M)=4, Wed(N-Q)=4, Thu(R-U)=4, Fri(V-Y)=4, Sat(Z-AD)=5
const DAY_COL = [1, 6, 10, 14, 18, 22, 26]; // start col per dow
const DAY_W   = [5, 4, 4, 4, 4, 4, 5];      // num cols per dow
const DOW_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const ROWS_PER_WEEK = 7;
const TOTAL_COLS = 30; // A..AD

// ── Colour palette (matching web calendar) ──────────────────────
// Day-of-week header colours
const DOW_COLORS: Record<number, string> = {
  0: 'FFDC2626', // Sun — red-600
  1: 'FFFACC15', // Mon — yellow-400
  2: 'FFDB2777', // Tue — pink-600
  3: 'FF16A34A', // Wed — green-600
  4: 'FFF97316', // Thu — orange-500
  5: 'FF2563EB', // Fri — blue-600
  6: 'FF9333EA', // Sat — purple-600
};
const DOW_TEXT: Record<number, string> = {
  0: 'FFFFFFFF', 1: 'FF000000', 2: 'FFFFFFFF', 3: 'FFFFFFFF',
  4: 'FFFFFFFF', 5: 'FFFFFFFF', 6: 'FFFFFFFF',
};

// Shift-type header & cell bg  (header / cell tint)
const PAL = {
  chao:  { hdr: 'FFA7F3D0', hdrText: 'FF064E3B', cell: 'FFECFDF5' },   // emerald
  bai:   { hdr: 'FFFED7AA', hdrText: 'FF7C2D12', cell: 'FFFFF7ED' },   // orange
  rung:  { hdr: 'FFFECDD3', hdrText: 'FF9F1239', cell: 'FFFFF1F2' },   // rose
  duek:  { hdr: 'FFC7D2FE', hdrText: 'FF3730A3', cell: 'FFEEF2FF' },   // indigo
  date:  { hdr: 'FFF1F5F9', hdrText: 'FF334155', cell: 'FFF1F5F9' },   // slate
};

// ── Helpers ──────────────────────────────────────────────────────
function getDeptName(s: Shift): string { return s.department?.name || s.department_name || ''; }
function getNickname(s: Shift): string { return s.user?.nickname || s.user_nickname || s.user?.f_name || s.user_f_name || ''; }

function fmtDate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface DayShifts {
  date: number; dow: number; isHoliday: boolean;
  project: string; surg1: string; surg2: string; medDC: string; medCont: string; er: string;
  chemo1: string; chemo2: string;
  baiER: string; baiMED: string; baiProject: string;
  smc1: string; smc2: string;
  rungOPD: string; rungER: string; rungHIV: string;
  duek: string;
}

function buildDay(dayNum: number, dateObj: Date, shifts: Shift[], hols: Set<string>): DayShifts {
  const dow = dateObj.getDay();
  const dateStr = fmtDate(dateObj);
  const isHoliday = dow === 0 || dow === 6 || hols.has(dateStr);
  const ds = shifts.filter(s => s.date === dateStr);

  const find = (type: string, dept: string, pos?: string) => {
    const s = ds.find(s => {
      const d = getDeptName(s);
      return s.shift_type === type && (d === dept || d.toUpperCase() === dept.toUpperCase())
        && (!pos || (s.position || '').toUpperCase() === pos.toUpperCase());
    });
    return s ? getNickname(s) : '';
  };

  const findAll = (type: string, dept: string) =>
    ds.filter(s => s.shift_type === type && (getDeptName(s) === dept || getDeptName(s).toUpperCase() === dept.toUpperCase()))
      .map(getNickname);

  const smc = findAll('บ่าย', 'SMC');
  const chemo = findAll('เช้า', 'Chemo');
  const surg = findAll('เช้า', 'SURG');

  return {
    date: dayNum, dow, isHoliday,
    project: isHoliday ? find('เช้า', 'โครงการ') : '',
    surg1: surg[0] || '', surg2: surg[1] || '',
    medDC: find('เช้า', 'MED', 'D/C'), medCont: find('เช้า', 'MED', 'Cont'),
    er: find('เช้า', 'ER'),
    chemo1: chemo[0] || '', chemo2: chemo[1] || '',
    baiER: find('บ่าย', 'ER'), baiMED: find('บ่าย', 'MED'),
    baiProject: isHoliday ? '' : find('บ่าย', 'โครงการ'),
    smc1: smc[0] || '', smc2: smc[1] || '',
    rungOPD: find('รุ่งอรุณ', 'รุ่งอรุณ', 'OPD'),
    rungER: find('รุ่งอรุณ', 'รุ่งอรุณ', 'ER'),
    rungHIV: find('รุ่งอรุณ', 'รุ่งอรุณ', 'HIV'),
    duek: find('ดึก', 'ER'),
  };
}

// ── Main export ──────────────────────────────────────────────────
export async function exportScheduleTable(shifts: Shift[], holidays: Holiday[], year: number, month: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Form', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25, header: 0, footer: 0 } },
  });

  const F = 'TH SarabunPSK';
  const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFD1D5DB' } };   // gray-300
  const med:  Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF94A3B8' } };  // slate-400
  const thinB: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };
  const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  // Column widths
  for (let dow = 0; dow < 7; dow++) {
    const sc = DAY_COL[dow], nc = DAY_W[dow];
    for (let c = 0; c < nc; c++) {
      const ci = sc + c;
      ws.getColumn(ci).width = c === nc - 1 ? 3.8 : (nc === 5 ? 7.5 : 7.5);
    }
  }

  // ── Row 1: Title ──
  const thaiMonth = THAI_MONTHS[month - 1];
  const BY = year + 543;
  ws.mergeCells(1, 1, 1, TOTAL_COLS);
  const tc = ws.getCell(1, 1);
  tc.value = `ตารางเวรเภสัชกรประจำเดือน ${thaiMonth} ${BY}`;
  tc.font = { name: F, size: 22, bold: true, color: { argb: 'FF1E293B' } };
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // ── Row 2: spacer ──
  ws.getRow(2).height = 4;

  // ── Row 3: Day-of-week headers ──
  for (let dow = 0; dow < 7; dow++) {
    const sc = DAY_COL[dow], nc = DAY_W[dow];
    ws.mergeCells(3, sc, 3, sc + nc - 1);
    const c = ws.getCell(3, sc);
    c.value = DOW_NAMES[dow];
    c.font = { name: F, size: 14, bold: true, color: { argb: DOW_TEXT[dow] } };
    c.fill = fill(DOW_COLORS[dow]);
    c.alignment = center;
    c.border = { top: med, bottom: med, left: med, right: med };
    for (let i = sc + 1; i < sc + nc; i++) {
      const mc = ws.getCell(3, i);
      mc.border = { top: med, bottom: med, left: thin, right: i === sc + nc - 1 ? med : thin };
    }
  }
  ws.getRow(3).height = 22;

  // ── Build weeks ──
  const daysInMonth = new Date(year, month, 0).getDate();
  const holSet = new Set(holidays.map(h => h.date));
  const weeks: (DayShifts | null)[][] = [];
  let cw: (DayShifts | null)[] = new Array(7).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (d > 1 && dow === 0) { weeks.push(cw); cw = new Array(7).fill(null); }
    cw[dow] = buildDay(d, dt, shifts, holSet);
  }
  weeks.push(cw);

  // ── Render each week ──
  let row = 4;
  for (const week of weeks) {
    renderWeek(ws, row, week, F, thinB, thin, med, center, fill);
    row += ROWS_PER_WEEK;
  }

  // ── Legend ──
  row += 1;
  const legendFont = { name: F, size: 13 };
  const legendBold = { ...legendFont, bold: true };
  const legends = [
    { label: 'SURG', items: ['รายชื่อ 1 = เช้า SURG (บน)', 'รายชื่อ 2 = เช้า SURG (ล่าง)'], color: PAL.chao.hdr },
    { label: 'MED', items: ['รายชื่อ 1 = D/C', 'รายชื่อ 2 = Cont'], color: PAL.chao.hdr },
    { label: 'บ่าย', items: ['รายชื่อ 1 = บ่าย ER', 'รายชื่อ 2 = บ่าย MED'], color: PAL.bai.hdr },
    { label: 'รุ่งอรุณ', items: ['รายชื่อ 1 = OPD', 'รายชื่อ 2 = ER', 'รายชื่อ 3 = HIV'], color: PAL.rung.hdr },
  ];
  for (const lg of legends) {
    const c1 = ws.getCell(row, 1);
    c1.value = lg.label; c1.font = legendBold; c1.fill = fill(lg.color);
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    c1.border = thinB;
    ws.mergeCells(row, 1, row, 2);
    for (let i = 0; i < lg.items.length; i++) {
      const ci = ws.getCell(row, 3 + i * 4);
      ci.value = lg.items[i]; ci.font = legendFont;
      ci.alignment = { vertical: 'middle' };
    }
    ws.getRow(row).height = 18;
    row++;
  }

  // ── Download ──
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `ตารางเวรเภสัชกร_${thaiMonth}_${BY}.xlsx`);
}

// ── Week renderer ────────────────────────────────────────────────
function renderWeek(
  ws: ExcelJS.Worksheet, sr: number, days: (DayShifts | null)[],
  F: string,
  thinB: Partial<ExcelJS.Borders>, thin: Partial<ExcelJS.Border>, med: Partial<ExcelJS.Border>,
  center: Partial<ExcelJS.Alignment>,
  fill: (argb: string) => ExcelJS.Fill,
) {
  // Row heights
  const rh = [15, 16, 16, 15, 16, 16, 14];
  for (let r = 0; r < ROWS_PER_WEEK; r++) ws.getRow(sr + r).height = rh[r];

  // Helper: set a cell with value, font, fill, alignment, border
  const set = (r: number, c: number, val: string | number,
    opts: { font?: Partial<ExcelJS.Font>; fill?: string; border?: Partial<ExcelJS.Borders> } = {}) => {
    const cell = ws.getCell(sr + r, c);
    if (val !== '') cell.value = val;
    cell.font = opts.font || { name: F, size: 13 };
    cell.alignment = center;
    cell.border = opts.border || thinB;
    if (opts.fill) cell.fill = fill(opts.fill);
  };

  // Helper: merge cells then set value (ExcelJS: set value on top-left, border on all corners)
  const merge = (r1: number, c1: number, r2: number, c2: number, val: string | number,
    opts: { font?: Partial<ExcelJS.Font>; fill?: string; border?: Partial<ExcelJS.Borders> } = {}) => {
    ws.mergeCells(sr + r1, c1, sr + r2, c2);
    set(r1, c1, val, opts);
    // Apply border to all cells in merged range
    const bdr = opts.border || thinB;
    for (let r = sr + r1; r <= sr + r2; r++) {
      for (let c = c1; c <= c2; c++) {
        ws.getCell(r, c).border = bdr;
      }
    }
  };

  // Day separator border (medium right border on last col of each day)
  const dayRightBorder = (r: number, col: number) => {
    const cell = ws.getCell(sr + r, col);
    const b = cell.border || {};
    cell.border = { ...b, right: med };
  };

  // Section header font & name font
  const hdrFont = (pal: { hdrText: string }) => ({ name: F, size: 11, bold: true, color: { argb: pal.hdrText } });
  const dateFont = { name: F, size: 16, bold: true, color: { argb: 'FF334155' } };
  const nameFont = { name: F, size: 13 };

  for (let dow = 0; dow < 7; dow++) {
    const day = days[dow];
    const sc = DAY_COL[dow], nc = DAY_W[dow];
    const lastCol = sc + nc - 1;
    const dateCol = lastCol;
    const isWE = dow === 0 || dow === 6;

    // First: apply thin borders + base bg to entire block
    for (let r = 0; r < ROWS_PER_WEEK; r++) {
      for (let c = sc; c <= lastCol; c++) {
        const cell = ws.getCell(sr + r, c);
        cell.border = thinB;
        cell.alignment = center;
      }
      // Medium right border as day separator
      dayRightBorder(r, lastCol);
    }

    if (!day) continue;

    // Determine if this day is holiday (weekend or public holiday)
    const holiday = day.isHoliday;

    if (holiday && isWE) {
      // ══ Weekend layout: 5 cols ══
      // gridCols: c1=โครงการ, c2=SURG, c3=MED, c4=บ่าย, c5=date
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = sc + 3, c5 = dateCol;

      // ROW 0: section labels + date
      set(0, c1, 'โครงการ', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(0, c2, 'SURG', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(0, c3, 'MED', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(0, c4, 'บ่าย', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      set(0, c5, day.date, { font: dateFont, fill: dow === 0 ? 'FFFEE2E2' : PAL.date.hdr }); // red-100 for Sunday

      // ROW 1-2: โครงการ merged, SURG 2 rows, MED separate rows, บ่าย separate rows
      merge(1, c1, 2, c1, day.project, { font: nameFont, fill: PAL.chao.cell });
      set(1, c2, day.surg1, { font: nameFont, fill: PAL.chao.cell });
      set(2, c2, day.surg2, { font: nameFont, fill: PAL.chao.cell });
      set(1, c3, day.medDC, { font: nameFont, fill: PAL.chao.cell });
      set(2, c3, day.medCont, { font: nameFont, fill: PAL.chao.cell });
      // บ่าย spans c4-c5
      merge(1, c4, 1, c5, day.baiER, { font: nameFont, fill: PAL.bai.cell });
      merge(2, c4, 2, c5, day.baiMED, { font: nameFont, fill: PAL.bai.cell });

      // ROW 3: ER / Chemo / ดึก labels
      set(3, c1, 'ER', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(3, c2, 'Chemo', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      merge(3, c3, 3, c5, 'ดึก', { font: hdrFont(PAL.duek), fill: PAL.duek.hdr });

      // ROW 4-6: ER merged, Chemo 2 rows, ดึก merged
      merge(4, c1, 6, c1, day.er, { font: nameFont, fill: PAL.chao.cell });
      // Chemo: 2 sub-rows
      merge(4, c2, 5, c2, day.chemo1, { font: nameFont, fill: PAL.chao.cell });
      set(6, c2, day.chemo2, { font: nameFont, fill: PAL.chao.cell });
      merge(4, c3, 6, c5, day.duek, { font: nameFont, fill: PAL.duek.cell });

    } else if (holiday && !isWE) {
      // ══ Weekday holiday: 4 cols — same as weekend but compressed ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(0, c2, 'MED', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(0, c3, 'บ่าย', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      set(0, c4, day.date, { font: dateFont, fill: 'FFFEE2E2' });

      merge(1, c1, 2, c1, day.project, { font: nameFont, fill: PAL.chao.cell });
      set(1, c2, day.medDC, { font: nameFont, fill: PAL.chao.cell });
      set(2, c2, day.medCont, { font: nameFont, fill: PAL.chao.cell });
      merge(1, c3, 1, c4, day.baiER, { font: nameFont, fill: PAL.bai.cell });
      merge(2, c3, 2, c4, day.baiMED, { font: nameFont, fill: PAL.bai.cell });

      set(3, c1, 'ER', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      set(3, c2, 'SURG', { font: hdrFont(PAL.chao), fill: PAL.chao.hdr });
      merge(3, c3, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: PAL.duek.hdr });

      merge(4, c1, 6, c1, day.er, { font: nameFont, fill: PAL.chao.cell });
      merge(4, c2, 5, c2, day.surg1, { font: nameFont, fill: PAL.chao.cell });
      set(6, c2, day.surg2, { font: nameFont, fill: PAL.chao.cell });
      merge(4, c3, 6, c4, day.duek, { font: nameFont, fill: PAL.duek.cell });

    } else if (dow >= 1 && dow <= 4) {
      // ══ Mon-Thu: 4 cols — โครงการ | SMC | บ่าย | date ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      set(0, c2, 'SMC', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      set(0, c3, 'บ่าย', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      set(0, c4, day.date, { font: dateFont, fill: PAL.date.hdr });

      // โครงการ merged rows 1-2
      merge(1, c1, 2, c1, day.baiProject, { font: nameFont, fill: PAL.bai.cell });
      // SMC: 2 rows
      set(1, c2, day.smc1, { font: nameFont, fill: PAL.bai.cell });
      set(2, c2, day.smc2, { font: nameFont, fill: PAL.bai.cell });
      // บ่าย ER/MED span c3-c4
      merge(1, c3, 1, c4, day.baiER, { font: nameFont, fill: PAL.bai.cell });
      merge(2, c3, 2, c4, day.baiMED, { font: nameFont, fill: PAL.bai.cell });

      // รุ่งอรุณ / ดึก
      set(3, c1, 'รุ่งอรุณ', { font: hdrFont(PAL.rung), fill: PAL.rung.hdr });
      merge(3, c2, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: PAL.duek.hdr });

      // รุ่งอรุณ rows 4-6
      set(4, c1, day.rungOPD, { font: nameFont, fill: PAL.rung.cell });
      set(5, c1, day.rungER, { font: nameFont, fill: PAL.rung.cell });
      set(6, c1, day.rungHIV, { font: nameFont, fill: PAL.rung.cell });
      // ดึก merged
      merge(4, c2, 6, c4, day.duek, { font: nameFont, fill: PAL.duek.cell });

    } else {
      // ══ Friday: 4 cols — โครงการ | บ่าย(merged) | date ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      merge(0, c2, 0, c3, 'บ่าย', { font: hdrFont(PAL.bai), fill: PAL.bai.hdr });
      set(0, c4, day.date, { font: dateFont, fill: PAL.date.hdr });

      merge(1, c1, 2, c1, day.baiProject, { font: nameFont, fill: PAL.bai.cell });
      merge(1, c2, 1, c4, day.baiER, { font: nameFont, fill: PAL.bai.cell });
      merge(2, c2, 2, c4, day.baiMED, { font: nameFont, fill: PAL.bai.cell });

      set(3, c1, 'รุ่งอรุณ', { font: hdrFont(PAL.rung), fill: PAL.rung.hdr });
      merge(3, c2, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: PAL.duek.hdr });

      set(4, c1, day.rungOPD, { font: nameFont, fill: PAL.rung.cell });
      set(5, c1, day.rungER, { font: nameFont, fill: PAL.rung.cell });
      set(6, c1, '', { font: nameFont, fill: PAL.rung.cell });
      merge(4, c2, 6, c4, day.duek, { font: nameFont, fill: PAL.duek.cell });
    }

    // Reapply medium right border on day boundary (may have been overwritten by merges)
    for (let r = 0; r < ROWS_PER_WEEK; r++) dayRightBorder(r, lastCol);
  }

  // Medium bottom border on entire last row of week
  for (let c = 1; c <= TOTAL_COLS; c++) {
    const cell = ws.getCell(sr + ROWS_PER_WEEK - 1, c);
    const b = cell.border || {};
    cell.border = { ...b, bottom: med };
  }
}
