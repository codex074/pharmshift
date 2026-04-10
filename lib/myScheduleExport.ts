import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, isSameMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { buildCalendarWeeks } from './calendarMonthGrid';
import { THAI_MONTHS } from './utils';
import type { Shift, Holiday } from './types';

// ── Colours matching MyCalendarGrid / web UI ─────────────────────
const DOW_BG: Record<number, string> = {
  0: 'FFFDE8E8', 1: 'FFFFFDE7', 2: 'FFFCE4EC',
  3: 'FFF1F8E9', 4: 'FFFFF3E0', 5: 'FFE3F2FD', 6: 'FFF3E5F5',
};
const DOW_HEADER_BG: Record<number, string> = {
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
  'เช้า':     { bg: 'FFEAF9FB', bd: 'FF9ADFE7', fg: 'FF185A57' },
  'บ่าย':     { bg: 'FFF5EFFA', bd: 'FFA17CC2', fg: 'FF5B2A86' },
  'ดึก':      { bg: 'FFF0F3FF', bd: 'FF8DA2FF', fg: 'FF3340A7' },
  'รุ่งอรุณ': { bg: 'FFFFF5E7', bd: 'FFF8BE57', fg: 'FF9A5514' },
  'smc':      { bg: 'FFF3ECFA', bd: 'FFAA83C9', fg: 'FF612F8C' },
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

type Border = { style: ExcelJS.BorderStyle; color: { argb: string } };

function mkBorder(style: ExcelJS.BorderStyle, argb: string): Border {
  return { style, color: { argb } };
}

const GRID_THICK = mkBorder('thin',   'FFD7DEE8');
const GRID_THIN  = mkBorder('thin',   'FFE3E8EF');
const GRID_DOT   = mkBorder('hair',   'FFF1F5F9');
const GRID_SOFT  = mkBorder('thin',   'FFEEF2F7');

/**
 * Apply border to a single cell.
 * top/bottom/left/right are each independently specified.
 */
function setBorder(
  cell: ExcelJS.Cell,
  top: Border, bottom: Border, left: Border, right: Border,
) {
  cell.border = { top, bottom, left, right };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function fontColorForDay(dow: number, isCurrentMonth: boolean, isHoliday: boolean, isWeekend: boolean) {
  if (!isCurrentMonth) return 'FFB8C0CC';
  if (isHoliday || isWeekend) return 'FFEF4444';
  return 'FF374151';
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
    pageSetup: {
      paperSize: 9,          // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
    properties: { defaultRowHeight: 20 },
  });
  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];

  // A4 landscape margins (inches)
  ws.pageSetup.margins = {
    left: 0.5, right: 0.5,
    top: 0.6, bottom: 0.6,
    header: 0.3, footer: 0.3,
  };

  // Repeat header rows when printing on multiple pages
  ws.pageSetup.printTitlesRow = '1:3';

  const thaiYear = year + 543;
  const monthName = THAI_MONTHS[month - 1];

  // ── Column widths (7 columns A–G) for A4 landscape ───────────────
  // A4 landscape = ~297mm printable, minus 25mm margins ≈ 247mm / 7 ≈ 35mm each
  // Excel width unit ≈ 7px, 35mm ≈ 100px → ~14.3 units; use 17 for comfortable read
  for (let c = 1; c <= 7; c++) {
    ws.getColumn(c).width = 19;
  }

  // ── Row 1: Title ─────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, 7);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `ตารางเวรของ ${userName} — ${monthName} ${thaiYear}`;
  titleCell.font = { name: 'TH SarabunPSK', size: 22, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = fill('FFF7F4FF');
  ws.getRow(1).height = 34;
  setBorder(titleCell, GRID_THICK, GRID_SOFT, GRID_THICK, GRID_THICK);

  // ── Row 2: Stats ─────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const s of myShifts) counts[s.shift_type] = (counts[s.shift_type] || 0) + 1;
  const ORDER = ['รุ่งอรุณ', 'เช้า', 'บ่าย', 'ดึก', 'smc'];
  const statParts = ORDER
    .filter(t => counts[t])
    .map(t => `${t} ${counts[t]}`)
    .concat(
      Object.entries(counts)
        .filter(([t]) => !ORDER.includes(t))
        .map(([t, n]) => `${t} ${n}`),
    )
    .join('  |  ');

  ws.mergeCells(2, 1, 2, 7);
  const statCell = ws.getCell(2, 1);
  statCell.value = `รวม ${myShifts.length} เวร   ( ${statParts} )`;
  statCell.font = { name: 'TH SarabunPSK', size: 13, bold: true, color: { argb: 'FF6D28D9' } };
  statCell.alignment = { horizontal: 'center', vertical: 'middle' };
  statCell.fill = fill('FFFFFFFF');
  ws.getRow(2).height = 22;
  setBorder(statCell, GRID_SOFT, GRID_THIN, GRID_THICK, GRID_THICK);

  // ── Row 3: Day-of-week headers ───────────────────────────────────
  for (let d = 0; d < 7; d++) {
    const cell = ws.getCell(3, d + 1);
    cell.value = DOW_NAMES[d];
    cell.font = { name: 'TH SarabunPSK', size: 15, bold: true, color: { argb: DOW_FG[d] } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = fill(DOW_HEADER_BG[d]);
    setBorder(
      cell,
      GRID_THICK,
      GRID_THICK,
      d === 0 ? GRID_THICK : GRID_THIN,
      d === 6 ? GRID_THICK : GRID_THIN,
    );
  }
  ws.getRow(3).height = 30;

  // ── Build weeks ──────────────────────────────────────────────────
  const weeks = buildCalendarWeeks(year, month, myShifts, holidays, prevMonthLastDayShifts);
  const holMap = new Map(holidays.map(h => [h.date, h.name]));
  const monthStart = new Date(year, month - 1, 1);

  let currentRow = 4;
  const totalWeeks = weeks.length;

  for (let wi = 0; wi < totalWeeks; wi++) {
    const week = weeks[wi];
    const isLastWeek = wi === totalWeeks - 1;

    // Max shifts in any day this week (min 1 to ensure at least one shift row)
    const maxShifts = Math.max(1, ...week.map(d =>
      isSameMonth(d.date, monthStart) ? d.shifts.length : 0,
    ));

    const dateRow   = currentRow;              // row with date numbers
    const shiftRows = maxShifts;               // rows below for shift badges
    const blockEnd  = dateRow + shiftRows;     // last row index of this week block

    ws.getRow(dateRow).height = 30;
    for (let si = 1; si <= shiftRows; si++) {
      ws.getRow(dateRow + si).height = 28;
    }

    for (let d = 0; d < 7; d++) {
      const day = week[d];
      const isCurrentMonth = isSameMonth(day.date, monthStart);
      const dateStr = format(day.date, 'yyyy-MM-dd');
      const holName = holMap.get(dateStr);
      const isHoliday = !!holName;
      const isWeekend = d === 0 || d === 6;
      const isLeftEdge  = d === 0;
      const isRightEdge = d === 6;
      const dayTextColor = fontColorForDay(d, isCurrentMonth, isHoliday, isWeekend);

      // background colours for this day
      const dateBg = !isCurrentMonth
        ? 'FFFBFCFE'
        : 'FFFFFFFF';

      // ── Date number cell ──────────────────────────────────────
      const dateCell = ws.getCell(dateRow, d + 1);
      const dateNum  = parseInt(format(day.date, 'd'));
      if (isHoliday && isCurrentMonth && holName) {
        // date number + holiday name on second line
        dateCell.value = {
          richText: [
            {
              text: `${dateNum}`,
              font: {
                name: 'TH SarabunPSK', size: 16, bold: true,
                color: { argb: dayTextColor },
              },
            },
            {
              text: `\n${holName}`,
              font: {
                name: 'TH SarabunPSK', size: 10, bold: false,
                color: { argb: 'FF94A3B8' },
              },
            },
          ],
        };
        ws.getRow(dateRow).height = 38;
        dateCell.alignment = { horizontal: 'left', vertical: 'top', indent: 1, wrapText: true };
      } else {
        dateCell.value = dateNum;
        dateCell.font = {
          name: 'TH SarabunPSK', size: 16, bold: true,
          color: { argb: dayTextColor },
        };
        dateCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }
      dateCell.fill = fill(dateBg);

      // top border: thick for all; left/right: thick on edges, thin inside
      setBorder(
        dateCell,
        GRID_THICK,
        shiftRows > 0 ? GRID_THIN : (isLastWeek ? GRID_THICK : GRID_THIN),
        isLeftEdge  ? GRID_THICK : GRID_THIN,
        isRightEdge ? GRID_THICK : GRID_THIN,
      );

      // ── Shift rows ────────────────────────────────────────────
      for (let si = 1; si <= shiftRows; si++) {
        const shiftRowIdx = dateRow + si;
        const shiftCell   = ws.getCell(shiftRowIdx, d + 1);
        const shift       = isCurrentMonth ? day.shifts[si - 1] : undefined;
        const isLastShiftRow = si === shiftRows;

        if (shift) {
          const pal = getPal(shift.shift_type);
          shiftCell.value = shiftLabel(shift);
          shiftCell.font = {
            name: 'TH SarabunPSK', size: 13, bold: true,
            color: { argb: pal.fg },
          };
          shiftCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          shiftCell.fill = fill(pal.bg);
          setBorder(
            shiftCell,
            mkBorder('medium', pal.bd),
            mkBorder('medium', pal.bd),
            mkBorder('medium', pal.bd),
            mkBorder('medium', pal.bd),
          );
        } else {
          // empty slot — clean white day box like the calendar UI
          shiftCell.fill = fill(isCurrentMonth ? 'FFFFFFFF' : 'FFFBFCFE');
          setBorder(
            shiftCell,
            si === 1 ? GRID_THIN : GRID_DOT,
            isLastShiftRow ? (isLastWeek ? GRID_THICK : GRID_THIN) : GRID_DOT,
            isLeftEdge ? GRID_THICK : GRID_THIN,
            isRightEdge ? GRID_THICK : GRID_THIN,
          );
        }
      }
    }

    currentRow = blockEnd + 1;
  }

  // ── Footer ────────────────────────────────────────────────────────
  ws.mergeCells(currentRow, 1, currentRow, 7);
  const footCell = ws.getCell(currentRow, 1);
  footCell.value = `สร้างโดย เวรดี๊ดี — ${format(new Date(), 'd MMM yyyy', { locale: th })}`;
  footCell.font = { name: 'TH SarabunPSK', size: 10, color: { argb: 'FF9CA3AF' }, italic: true };
  footCell.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(currentRow).height = 18;
  footCell.fill = fill('FFFAFAFA');
  setBorder(footCell, GRID_SOFT, GRID_THICK, GRID_THICK, GRID_THICK);

  // ── Save ──────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `ตารางเวร_${userName}_${monthName}_${thaiYear}.xlsx`,
  );
}
