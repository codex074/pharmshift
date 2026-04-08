import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, isSameMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { buildCalendarWeeks } from './calendarMonthGrid';
import { THAI_MONTHS } from './utils';
import type { Shift, Holiday } from './types';

// ── Colours matching MyCalendarGrid / web UI ─────────────────────
const DOW_BG: Record<number, string> = {
  0: 'FFF3828A', 1: 'FFFEE66A', 2: 'FFFFB1DC',
  3: 'FFB6E666', 4: 'FFFEA86F', 5: 'FFA1DDFF', 6: 'FFD0AEEF',
};
const DOW_FG: Record<number, string> = {
  0: 'FF7F1D1D', 1: 'FF713F12', 2: 'FF831843',
  3: 'FF3B5E0A', 4: 'FF7C2D12', 5: 'FF0C4A6E', 6: 'FF4C1D95',
};
const DOW_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// Shift type → { bg, border, fg }
const SHIFT_PAL: Record<string, { bg: string; bd: string; fg: string }> = {
  'เช้า':     { bg: 'FFE8F9FA', bd: 'FF9FDCE0', fg: 'FF134E4A' },
  'บ่าย':     { bg: 'FFF3EDF8', bd: 'FF9E76B4', fg: 'FF4A044E' },
  'ดึก':      { bg: 'FFEEF0FF', bd: 'FF99ABFF', fg: 'FF1E1B4B' },
  'รุ่งอรุณ': { bg: 'FFFEF3DC', bd: 'FFFFCA72', fg: 'FF78350F' },
  'smc':      { bg: 'FFEDE9FE', bd: 'FFC4B5FD', fg: 'FF4C1D95' },
};
function getPal(shiftType: string) {
  return SHIFT_PAL[shiftType] ?? { bg: 'FFEDE9FE', bd: 'FFC4B5FD', fg: 'FF4C1D95' };
}

function getDeptName(s: Shift): string {
  return (s as any).department_name || s.department?.name || '';
}

function shiftLabel(s: Shift): string {
  const dept = getDeptName(s);
  const pos = (s as any).position || '';
  if (s.shift_type === 'เช้า' && dept === 'MED' && pos) return `MED ${pos}`;
  if (s.shift_type === 'เช้า' && dept === 'SURG') return 'SURG';
  if (dept === 'Chemo') return 'Chemo';
  if (s.shift_type === 'บ่าย' && dept === 'SMC') return 'SMC';
  if (s.shift_type === 'ดึก') return 'ดึก';
  if (s.shift_type === 'รุ่งอรุณ') return pos ? `รุ่งอรุณ ${pos}` : 'รุ่งอรุณ';
  if (dept === 'โครงการ') return 'โครงการ';
  if (s.shift_type === 'บ่าย' && dept) return `บ่าย ${dept}`;
  return s.shift_type + (dept ? ` ${dept}` : '');
}

function applyBorder(cell: ExcelJS.Cell, color: string) {
  const side: ExcelJS.BorderStyle = 'medium';
  const b = { style: side as ExcelJS.BorderStyle, color: { argb: color } };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

function applyOuterBorder(ws: ExcelJS.Worksheet, r: number, c: number, color: string) {
  const cell = ws.getCell(r, c);
  applyBorder(cell, color);
}

export async function exportMySchedule(
  myShifts: Shift[],
  holidays: Holiday[],
  year: number,
  month: number,
  userName: string,
  prevMonthLastDayShifts: Shift[] = [],
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PharmShift';
  wb.created = new Date();

  const ws = wb.addWorksheet('ตารางเวรของฉัน', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const thaiYear = year + 543;
  const monthName = THAI_MONTHS[month - 1];

  // ── Column widths (7 columns A-G) ────────────────────────────────
  for (let c = 1; c <= 7; c++) {
    ws.getColumn(c).width = 18;
  }

  // ── Row 1: Title ─────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, 7);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `ตารางเวรของ ${userName} — ${monthName} ${thaiYear}`;
  titleCell.font = { name: 'TH SarabunPSK', size: 18, bold: true, color: { argb: 'FF312E81' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
  ws.getRow(1).height = 36;

  // ── Row 2: Stats ─────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const s of myShifts) counts[s.shift_type] = (counts[s.shift_type] || 0) + 1;
  const statParts = Object.entries(counts)
    .map(([t, n]) => `${t} ${n}`)
    .join('  |  ');
  ws.mergeCells(2, 1, 2, 7);
  const statCell = ws.getCell(2, 1);
  statCell.value = `รวม ${myShifts.length} เวร   ( ${statParts} )`;
  statCell.font = { name: 'TH SarabunPSK', size: 13, color: { argb: 'FF6D28D9' } };
  statCell.alignment = { horizontal: 'center', vertical: 'middle' };
  statCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
  ws.getRow(2).height = 22;

  // ── Row 3: Day-of-week headers ───────────────────────────────────
  for (let d = 0; d < 7; d++) {
    const cell = ws.getCell(3, d + 1);
    cell.value = DOW_NAMES[d];
    cell.font = { name: 'TH SarabunPSK', size: 13, bold: true, color: { argb: DOW_FG[d] } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DOW_BG[d] } };
    const thin = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFE5E7EB' } };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  }
  ws.getRow(3).height = 24;

  // ── Build weeks ──────────────────────────────────────────────────
  const weeks = buildCalendarWeeks(year, month, myShifts, holidays, prevMonthLastDayShifts);
  const holSet = new Set(holidays.map(h => h.date));
  const monthStart = new Date(year, month - 1, 1);

  let currentRow = 4;

  for (const week of weeks) {
    // Find max shifts in any day this week
    const maxShifts = Math.max(1, ...week.map(d => d.shifts.length));

    // ── Date number row ──────────────────────────────────────────
    const dateRow = currentRow;
    ws.getRow(dateRow).height = 22;

    for (let d = 0; d < 7; d++) {
      const day = week[d];
      const cell = ws.getCell(dateRow, d + 1);
      const dow = d;
      const isCurrentMonth = isSameMonth(day.date, monthStart);
      const dateStr = format(day.date, 'yyyy-MM-dd');
      const isHoliday = holSet.has(dateStr);
      const isWeekend = dow === 0 || dow === 6;

      cell.value = parseInt(format(day.date, 'd'));
      cell.font = {
        name: 'TH SarabunPSK',
        size: 12,
        bold: true,
        color: {
          argb: !isCurrentMonth ? 'FFBDBDBD' :
                isHoliday || isWeekend ? DOW_FG[dow] : 'FF374151',
        },
      };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: {
          argb: !isCurrentMonth ? 'FFF9FAFB' :
                isHoliday || isWeekend ? DOW_BG[dow] + '66' : 'FFFFFFFF',
        },
      };
      const thin = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFE5E7EB' } };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    }

    // ── Shift rows ───────────────────────────────────────────────
    for (let si = 0; si < maxShifts; si++) {
      const shiftRow = currentRow + 1 + si;
      ws.getRow(shiftRow).height = 20;

      for (let d = 0; d < 7; d++) {
        const day = week[d];
        const cell = ws.getCell(shiftRow, d + 1);
        const shift = day.shifts[si];
        const isCurrentMonth = isSameMonth(day.date, monthStart);

        if (shift && isCurrentMonth) {
          const pal = getPal(shift.shift_type);
          const label = shiftLabel(shift);
          cell.value = label;
          cell.font = { name: 'TH SarabunPSK', size: 12, bold: true, color: { argb: pal.fg } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pal.bg } };
          const b = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: pal.bd } };
          cell.border = { top: b, left: b, bottom: b, right: b };
        } else {
          // Empty shift slot
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: isCurrentMonth ? 'FFFFFFFF' : 'FFF9FAFB' },
          };
          const thin = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFE5E7EB' } };
          cell.border = { top: thin, left: thin, bottom: thin, right: thin };
        }
      }
    }

    currentRow += 1 + maxShifts;
  }

  // ── Footer ────────────────────────────────────────────────────────
  ws.mergeCells(currentRow, 1, currentRow, 7);
  const footCell = ws.getCell(currentRow, 1);
  footCell.value = `สร้างโดย PharmShift — ${format(new Date(), 'd MMM yyyy', { locale: th })}`;
  footCell.font = { name: 'TH SarabunPSK', size: 10, color: { argb: 'FF9CA3AF' }, italic: true };
  footCell.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(currentRow).height = 18;

  // ── Save ──────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `ตารางเวร_${userName}_${monthName}_${thaiYear}.xlsx`,
  );
}
