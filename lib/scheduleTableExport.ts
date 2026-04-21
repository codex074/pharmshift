import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Shift, Holiday, UserRole } from './types';
import { THAI_MONTHS } from './utils';
import { getPreviousMonthLastDay } from './calendarMonthGrid';

// Column layout: Sun(A-E)=5, Mon(F-I)=4, Tue(J-M)=4, Wed(N-Q)=4, Thu(R-U)=4, Fri(V-Y)=4, Sat(Z-AD)=5
const DAY_COL = [1, 6, 10, 14, 18, 22, 26]; // start col per dow
const DAY_W   = [5, 4, 4, 4, 4, 4, 5];      // num cols per dow
const DOW_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const ROWS_PER_WEEK = 7;
const TOTAL_COLS = 30; // A..AD

// ── Colour palette (matching web calendar) ──────────────────────
// Day-of-week header colours
const DOW_COLORS: Record<number, string> = {
  0: 'FFF3828A', // Sun — coral
  1: 'FFFEE66A', // Mon — yellow
  2: 'FFFFB1DC', // Tue — pink
  3: 'FFB6E666', // Wed — green
  4: 'FFFEA86F', // Thu — orange
  5: 'FFA1DDFF', // Fri — sky blue
  6: 'FFD0AEEF', // Sat — lavender
};
const DOW_TEXT: Record<number, string> = {
  0: 'FF7F1D1D', // Sun — dark red
  1: 'FF713F12', // Mon — dark amber
  2: 'FF831843', // Tue — dark pink
  3: 'FF3B5E0A', // Wed — dark green
  4: 'FF7C2D12', // Thu — dark orange
  5: 'FF0C4A6E', // Fri — dark blue
  6: 'FF4C1D95', // Sat — dark violet
};

// Shift-type header & cell bg  (header / cell tint)
const PAL = {
  chao:  { hdr: 'FF9FDCE0', hdrText: 'FF164E63', cell: 'FFE8F9FA' },   // cyan (เช้า)
  bai:   { hdr: 'FF9E76B4', hdrText: 'FF3B0764', cell: 'FFF3EDF8' },   // purple (บ่าย)
  rung:  { hdr: 'FFFFCA72', hdrText: 'FF78350F', cell: 'FFFEF3DC' },   // amber (รุ่งอรุณ)
  duek:  { hdr: 'FF99ABFF', hdrText: 'FF1E1B4B', cell: 'FFEEF0FF' },   // periwinkle (ดึก)
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
  isPrevMonth?: boolean;
}

function buildUserLookup(...shiftGroups: Shift[][]): Map<string, NonNullable<Shift['user']>> {
  const userLookup = new Map<string, NonNullable<Shift['user']>>();

  for (const shifts of shiftGroups) {
    for (const shift of shifts) {
      if (shift.user && shift.user_id) {
        userLookup.set(shift.user_id, shift.user);
      }

      if (shift.original_user && shift.original_user_id) {
        userLookup.set(shift.original_user_id, shift.original_user);
      }
    }
  }

  return userLookup;
}

function withOriginalUser(shift: Shift, userLookup: Map<string, NonNullable<Shift['user']>>): Shift {
  if (!shift.original_user_id || shift.original_user_id === shift.user_id) {
    return shift;
  }

  const originalUser = shift.original_user || userLookup.get(shift.original_user_id);
  if (!originalUser) {
    return shift;
  }

  return {
    ...shift,
    user: originalUser,
    user_prefix: originalUser.prefix,
    user_f_name: originalUser.f_name,
    user_l_name: originalUser.l_name,
    user_nickname: originalUser.nickname,
  };
}

function buildDay(dayNum: number, dateObj: Date, shifts: Shift[], hols: Set<string>, role: UserRole): DayShifts {
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
  const surg = role === 'pharmacy_technician'
    ? [
        find('เช้า', 'SURG', 's1'),
        find('เช้า', 'SURG', 's2'),
      ].filter(Boolean)
    : findAll('เช้า', 'SURG');
  const medTop = role === 'pharmacy_technician'
    ? find('เช้า', 'MED', 'm1')
    : find('เช้า', 'MED', 'D/C');
  const medBottom = role === 'pharmacy_technician'
    ? find('เช้า', 'MED', 'm2')
    : find('เช้า', 'MED', 'Cont');

  return {
    date: dayNum, dow, isHoliday,
    project: isHoliday ? find('เช้า', 'โครงการ') : '',
    surg1: surg[0] || '', surg2: surg[1] || '',
    medDC: medTop, medCont: medBottom,
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
export async function exportScheduleTable(
  shifts: Shift[],
  holidays: Holiday[],
  year: number,
  month: number,
  useOriginal: boolean = false,
  prevMonthLastDayShifts: Shift[] = [],
  role: UserRole = 'pharmacist',
) {
  // ถ้า useOriginal ให้แทนที่ user ด้วย original user (ถ้ามี)
  if (useOriginal) {
    const userLookup = buildUserLookup(shifts, prevMonthLastDayShifts);
    shifts = shifts.map((shift) => withOriginalUser(shift, userLookup));
    prevMonthLastDayShifts = prevMonthLastDayShifts.map((shift) => withOriginalUser(shift, userLookup));
  }
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
      ws.getColumn(ci).width = c === nc - 1 ? 5 : 10;
    }
  }

  // ── Row 1: Title ──
  const thaiMonth = THAI_MONTHS[month - 1];
  const BY = year + 543;
  ws.mergeCells(1, 1, 1, TOTAL_COLS);
  const roleLabel = role === 'pharmacy_technician'
    ? 'เจ้าพนักงานเภสัชกรรม'
    : role === 'officer'
    ? 'เจ้าหน้าที่'
    : 'เภสัชกร';
  const fileLabel = role === 'pharmacy_technician'
    ? 'จพง'
    : role === 'officer'
    ? 'เจ้าหน้าที่'
    : 'เภสัชกร';
  const tc = ws.getCell(1, 1);
  tc.value = `ตารางเวร${roleLabel}ประจำเดือน ${thaiMonth} ${BY}`;
  tc.font = { name: F, size: 26, bold: true, color: { argb: 'FF1E293B' } };
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 38;

  // ── Row 2: spacer ──
  ws.getRow(2).height = 4;

  // ── Row 3: Day-of-week headers ──
  for (let dow = 0; dow < 7; dow++) {
    const sc = DAY_COL[dow], nc = DAY_W[dow];
    ws.mergeCells(3, sc, 3, sc + nc - 1);
    const c = ws.getCell(3, sc);
    c.value = DOW_NAMES[dow];
    c.font = { name: F, size: 20, bold: true, color: { argb: DOW_TEXT[dow] } };
    c.fill = fill(DOW_COLORS[dow]);
    c.alignment = center;
    c.border = { top: med, bottom: med, left: med, right: med };
    for (let i = sc + 1; i < sc + nc; i++) {
      const mc = ws.getCell(3, i);
      mc.border = { top: med, bottom: med, left: thin, right: i === sc + nc - 1 ? med : thin };
    }
  }
  ws.getRow(3).height = 28;

  // ── Build weeks ──
  const daysInMonth = new Date(year, month, 0).getDate();
  const holSet = new Set(holidays.map(h => h.date));
  const weeks: (DayShifts | null)[][] = [];
  let cw: (DayShifts | null)[] = new Array(7).fill(null);
  const firstDayDow = new Date(year, month - 1, 1).getDay();

  if (prevMonthLastDayShifts.length > 0) {
    const prevLastDate = getPreviousMonthLastDay(year, month);
    const prevLastDow = prevLastDate.getDay();
    const prevLastDateNum = prevLastDate.getDate();

    const prevDay = buildDay(prevLastDateNum, prevLastDate, prevMonthLastDayShifts, holSet, role);
    prevDay.isPrevMonth = true;

    const prevWeek: (DayShifts | null)[] = new Array(7).fill(null);
    prevWeek[prevLastDow] = prevDay;

    if (firstDayDow === 0) {
      weeks.push(prevWeek);
    } else {
      cw = prevWeek;
    }
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (d > 1 && dow === 0) { weeks.push(cw); cw = new Array(7).fill(null); }
    cw[dow] = buildDay(d, dt, shifts, holSet, role);
  }
  weeks.push(cw);

  // ── Render each week ──
  let row = 4;
  for (const week of weeks) {
    renderWeek(ws, row, week, F, thinB, thin, med, center, fill, role);
    row += ROWS_PER_WEEK;
  }

  // ── Legend ──
  row += 1;
  const legendFont = { name: F, size: 15 };
  const legendBold = { ...legendFont, bold: true };
  const legends = role === 'pharmacy_technician'
    ? [
        { label: 'MED', items: ['รายชื่อ 1 = D/C', 'รายชื่อ 2 = IPD'], color: PAL.chao.hdr },
        { label: 'บ่าย', items: ['รายชื่อ 1 = บ่าย ER', 'รายชื่อ 2 = บ่าย MED'], color: PAL.bai.hdr },
        { label: 'รุ่งอรุณ', items: ['รายชื่อ 1 = OPD', 'รายชื่อ 2 = ER', 'รายชื่อ 3 = HIV'], color: PAL.rung.hdr },
      ]
    : [
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
  const suffix = useOriginal ? '_ตารางเดิม' : '';
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `ตารางเวร${fileLabel}_${thaiMonth}_${BY}${suffix}.xlsx`);
}

// ── Week renderer ────────────────────────────────────────────────
function renderWeek(
  ws: ExcelJS.Worksheet, sr: number, days: (DayShifts | null)[],
  F: string,
  thinB: Partial<ExcelJS.Borders>, thin: Partial<ExcelJS.Border>, med: Partial<ExcelJS.Border>,
  center: Partial<ExcelJS.Alignment>,
  fill: (argb: string) => ExcelJS.Fill,
  role: UserRole,
) {
  // Row heights
  const rh = [22, 28, 28, 22, 28, 28, 20];
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

  // Section header font & name font — with muted variants for previous month
  const hdrFontNormal = (pal: { hdrText: string }) => ({ name: F, size: 18, bold: true, color: { argb: pal.hdrText } });
  const dateFontNormal: Partial<ExcelJS.Font> = { name: F, size: 20, bold: true, color: { argb: 'FF334155' } };
  const nameFontNormal: Partial<ExcelJS.Font> = { name: F, size: 18 };

  // Muted (40% opacity-like) — lighter text colours for previous month
  const hdrFontMuted = (pal: { hdrText: string }) => {
    // Blend header text towards white (~40% opacity)
    const hex = pal.hdrText.slice(2); // strip 'FF'
    const r = Math.round(parseInt(hex.slice(0, 2), 16) * 0.4 + 255 * 0.6);
    const g = Math.round(parseInt(hex.slice(2, 4), 16) * 0.4 + 255 * 0.6);
    const b = Math.round(parseInt(hex.slice(4, 6), 16) * 0.4 + 255 * 0.6);
    const muted = 'FF' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
    return { name: F, size: 18, bold: true, color: { argb: muted } };
  };
  const dateFontMuted: Partial<ExcelJS.Font> = { name: F, size: 20, bold: true, color: { argb: 'FFADB5BD' } };
  const nameFontMuted: Partial<ExcelJS.Font> = { name: F, size: 18, color: { argb: 'FFADB5BD' } };

  // Muted fill — blend colour towards white (65% original, 35% white)
  const mutedFill = (argb: string) => {
    const hex = argb.slice(2);
    const r = Math.round(parseInt(hex.slice(0, 2), 16) * 0.65 + 255 * 0.35);
    const g = Math.round(parseInt(hex.slice(2, 4), 16) * 0.65 + 255 * 0.35);
    const b = Math.round(parseInt(hex.slice(4, 6), 16) * 0.65 + 255 * 0.35);
    return 'FF' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
  };

  for (let dow = 0; dow < 7; dow++) {
    const day = days[dow];
    const sc = DAY_COL[dow], nc = DAY_W[dow];
    const lastCol = sc + nc - 1;
    const dateCol = lastCol;
    const isWE = dow === 0 || dow === 6;

    // First: apply thin borders + base bg to entire block
    const isPrevDay = !!day?.isPrevMonth;
    for (let r = 0; r < ROWS_PER_WEEK; r++) {
      for (let c = sc; c <= lastCol; c++) {
        const cell = ws.getCell(sr + r, c);
        cell.border = thinB;
        cell.alignment = center;
        // Apply subtle base fill for prev month day so structure is visible
        if (isPrevDay) cell.fill = fill('FFEDEEF2');
      }
      // Medium right border as day separator
      dayRightBorder(r, lastCol);
    }

    if (!day) continue;

    // Select normal or muted fonts/fills based on whether this is a previous month day
    const muted = !!day.isPrevMonth;
    const hdrFont = muted ? hdrFontMuted : hdrFontNormal;
    const dateFont = muted ? dateFontMuted : dateFontNormal;
    const nameFont = muted ? nameFontMuted : nameFontNormal;
    const cellFill = (argb: string) => muted ? mutedFill(argb) : argb;

    // Determine if this day is holiday (weekend or public holiday)
    const holiday = day.isHoliday;

    if (role === 'pharmacy_technician' && holiday && isWE) {
      // ══ Pharmacy technician weekend layout: 5 cols ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = sc + 3, c5 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c2, 'MED', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      merge(0, c3, 0, c4, 'บ่าย', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c5, day.date, { font: dateFont, fill: cellFill(dow === 0 ? 'FFFEE2E2' : PAL.date.hdr) });

      merge(1, c1, 2, c1, day.project, { font: nameFont });
      set(1, c2, day.medDC, { font: nameFont });
      set(2, c2, day.medCont, { font: nameFont });
      merge(1, c3, 1, c5, day.baiER, { font: nameFont });
      merge(2, c3, 2, c5, day.baiMED, { font: nameFont });

      set(3, c1, 'ER', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(3, c2, 'SURG', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      merge(3, c3, 3, c5, 'ดึก', { font: hdrFont(PAL.duek), fill: cellFill(PAL.duek.hdr) });

      merge(4, c1, 6, c1, day.er, { font: nameFont });
      set(4, c2, day.surg1, { font: nameFont });
      set(5, c2, day.surg2, { font: nameFont });
      merge(4, c3, 6, c5, day.duek, { font: nameFont });

    } else if (role === 'pharmacy_technician' && holiday) {
      // ══ Pharmacy technician weekday holiday layout: 4 cols ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c2, 'MED', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c3, 'บ่าย', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c4, day.date, { font: dateFont, fill: cellFill('FFFEE2E2') });

      merge(1, c1, 2, c1, day.project, { font: nameFont });
      set(1, c2, day.medDC, { font: nameFont });
      set(2, c2, day.medCont, { font: nameFont });
      merge(1, c3, 1, c4, day.baiER, { font: nameFont });
      merge(2, c3, 2, c4, day.baiMED, { font: nameFont });

      set(3, c1, 'ER', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(3, c2, 'SURG', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      merge(3, c3, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: cellFill(PAL.duek.hdr) });

      merge(4, c1, 6, c1, day.er, { font: nameFont });
      set(4, c2, day.surg1, { font: nameFont });
      set(5, c2, day.surg2, { font: nameFont });
      set(6, c2, '', { font: nameFont });
      merge(4, c3, 6, c4, day.duek, { font: nameFont });

    } else if (holiday && isWE) {
      // ══ Weekend layout: 5 cols ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = sc + 3, c5 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c2, 'SURG', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c3, 'MED', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c4, 'บ่าย', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c5, day.date, { font: dateFont, fill: cellFill(dow === 0 ? 'FFFEE2E2' : PAL.date.hdr) });

      merge(1, c1, 2, c1, day.project, { font: nameFont });
      set(1, c2, day.surg1, { font: nameFont });
      set(2, c2, day.surg2, { font: nameFont });
      set(1, c3, day.medDC, { font: nameFont });
      set(2, c3, day.medCont, { font: nameFont });
      merge(1, c4, 1, c5, day.baiER, { font: nameFont });
      merge(2, c4, 2, c5, day.baiMED, { font: nameFont });

      set(3, c1, 'ER', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(3, c2, 'Chemo', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      merge(3, c3, 3, c5, 'ดึก', { font: hdrFont(PAL.duek), fill: cellFill(PAL.duek.hdr) });

      merge(4, c1, 6, c1, day.er, { font: nameFont });
      merge(4, c2, 5, c2, day.chemo1, { font: nameFont });
      set(6, c2, day.chemo2, { font: nameFont });
      merge(4, c3, 6, c5, day.duek, { font: nameFont });

    } else if (holiday && !isWE) {
      // ══ Weekday holiday: 4 cols ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'SURG',  { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c2, 'MED',   { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(0, c3, 'บ่าย', { font: hdrFont(PAL.bai),  fill: cellFill(PAL.bai.hdr) });
      set(0, c4, day.date, { font: dateFont, fill: cellFill('FFFEE2E2') });

      set(1, c1, day.surg1,  { font: nameFont });
      set(2, c1, day.surg2,  { font: nameFont });
      set(1, c2, day.medDC,  { font: nameFont });
      set(2, c2, day.medCont,{ font: nameFont });
      merge(1, c3, 1, c4, day.baiER,  { font: nameFont });
      merge(2, c3, 2, c4, day.baiMED, { font: nameFont });

      set(3, c1, 'โครงการ', { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(3, c2, 'Chemo',   { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      merge(3, c3, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: cellFill(PAL.duek.hdr) });

      set(4, c1, day.project, { font: nameFont });
      set(5, c1, 'ER',        { font: hdrFont(PAL.chao), fill: cellFill(PAL.chao.hdr) });
      set(6, c1, day.er,      { font: nameFont });
      merge(4, c2, 5, c2, day.chemo1, { font: nameFont });
      set(6, c2, day.chemo2,           { font: nameFont });
      merge(4, c3, 6, c4, day.duek,   { font: nameFont });

    } else if (dow >= 1 && dow <= 4) {
      // ══ Mon-Thu: 4 cols ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c2, 'SMC', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c3, 'บ่าย', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c4, day.date, { font: dateFont, fill: cellFill(PAL.date.hdr) });

      merge(1, c1, 2, c1, day.baiProject, { font: nameFont });
      set(1, c2, day.smc1, { font: nameFont });
      set(2, c2, day.smc2, { font: nameFont });
      merge(1, c3, 1, c4, day.baiER, { font: nameFont });
      merge(2, c3, 2, c4, day.baiMED, { font: nameFont });

      set(3, c1, 'รุ่งอรุณ', { font: hdrFont(PAL.rung), fill: cellFill(PAL.rung.hdr) });
      merge(3, c2, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: cellFill(PAL.duek.hdr) });

      set(4, c1, day.rungOPD, { font: nameFont });
      set(5, c1, day.rungER, { font: nameFont });
      set(6, c1, day.rungHIV, { font: nameFont });
      merge(4, c2, 6, c4, day.duek, { font: nameFont });

    } else {
      // ══ Friday: 4 cols ══
      const c1 = sc, c2 = sc + 1, c3 = sc + 2, c4 = dateCol;

      set(0, c1, 'โครงการ', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      merge(0, c2, 0, c3, 'บ่าย', { font: hdrFont(PAL.bai), fill: cellFill(PAL.bai.hdr) });
      set(0, c4, day.date, { font: dateFont, fill: cellFill(PAL.date.hdr) });

      merge(1, c1, 2, c1, day.baiProject, { font: nameFont });
      merge(1, c2, 1, c4, day.baiER, { font: nameFont });
      merge(2, c2, 2, c4, day.baiMED, { font: nameFont });

      set(3, c1, 'รุ่งอรุณ', { font: hdrFont(PAL.rung), fill: cellFill(PAL.rung.hdr) });
      merge(3, c2, 3, c4, 'ดึก', { font: hdrFont(PAL.duek), fill: cellFill(PAL.duek.hdr) });

      set(4, c1, day.rungOPD, { font: nameFont });
      set(5, c1, day.rungER, { font: nameFont });
      set(6, c1, '', { font: nameFont });
      merge(4, c2, 6, c4, day.duek, { font: nameFont });
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
