import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Shift } from './types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  compensationRatesToRows,
  getCompensationRate,
  normalizeCompensationRates,
  type CompensationRatesMap,
} from './compensation';

// Helper to get total days in a month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// Convert number to Thai Baht text
function toThaiBahtText(amount: number): string {
  if (amount === 0) return 'ศูนย์บาทถ้วน';

  const textNum = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const textDigit = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  const bahtStr = Math.floor(amount).toString();
  const satangStr = Math.round((amount - Math.floor(amount)) * 100).toString().padStart(2, '0');

  function convertToString(str: string): string {
    if (str === '0' || str === '00') return '';
    let res = '';
    const len = str.length;
    for (let i = 0; i < len; i++) {
      const d = parseInt(str[i]);
      const pos = len - 1 - i;
      if (d !== 0) {
        if (pos === 1 && d === 1) {
          res += 'สิบ';
        } else if (pos === 1 && d === 2) {
          res += 'ยี่สิบ';
        } else if (pos === 0 && d === 1 && len > 1 && str[len - 2] !== '0') {
          res += 'เอ็ด';
        } else {
          res += textNum[d] + textDigit[pos % 6];
        }
      }
    }
    return res;
  }

  let result = convertToString(bahtStr);
  result += result ? 'บาท' : '';

  if (satangStr === '00') {
    result += 'ถ้วน';
  } else {
    result += convertToString(satangStr) + 'สตางค์';
  }

  return result || 'ศูนย์บาทถ้วน';
}

function getDeptName(s: Shift) {
  return s.department?.name || s.department_name || '';
}

function excelCol(colNumber: number): string {
  let n = colNumber;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function dayRange(rowNumber: number) {
  return `G${rowNumber}:AK${rowNumber}`;
}

function nonBlankCountFormula(rowNumber: number) {
  return `COUNTA(${dayRange(rowNumber)})`;
}

function guardedFormula(formula: string, rowNumber: number) {
  return `IF(${nonBlankCountFormula(rowNumber)}=0,0,${formula})`;
}

function getShiftCode(s: Shift): string {
  const dept = getDeptName(s).toUpperCase();
  if (s.shift_type === 'ดึก') return 'ด';
  if (s.shift_type === 'เช้า') {
    if (dept === 'MED') return 'ชอ';
    if (dept === 'SURG') return 'ชศ';
    if (dept === 'ER') return 'ชฉ';
    return 'ช';
  }
  if (s.shift_type === 'บ่าย') {
    if (dept === 'ER') return 'บฉ';
    if (dept === 'MED') return 'บอ';
    if (dept === 'SURG') return 'บศ';
    return 'บ';
  }
  return '1';
}

interface DayEntry {
  val: number;
  code?: string;
}

interface UserRowData {
  userId: string;
  firstName: string;
  lastName: string;
  salaryNumber: string;
  role: string;
  phaId: number;
  days: Record<number, DayEntry[]>;
  totalValue: number;
  totalAmount: number;
}

type ExportUserInfo = {
  id: string;
  f_name: string;
  l_name: string;
  prefix: string;
  role: string;
  pha_id: string | number;
  salary_number: string;
  nickname: string;
  is_active?: boolean;
  is_readonly?: boolean;
};

function buildUserRowData(user: ExportUserInfo): UserRowData {
  const phaIdRaw = user.pha_id ?? 0;
  const phaId = typeof phaIdRaw === 'number'
    ? phaIdRaw
    : parseInt(String(phaIdRaw).replace(/\D/g, ''), 10) || 0;

  return {
    userId: user.id,
    firstName: `${user.prefix || ''}${user.f_name || ''}`.trim() || user.nickname || 'ไม่ทราบชื่อ',
    lastName: user.l_name || '',
    salaryNumber: user.salary_number || '',
    role: user.role || 'pharmacist',
    phaId,
    days: {},
    totalValue: 0,
    totalAmount: 0,
  };
}

export async function exportEvidenceExcel(
  shifts: Shift[],
  users: ExportUserInfo[],
  year: number,
  month: number,
  compensationRates?: CompensationRatesMap,
) {
  // Build usersMap for quick lookup
  const usersMap = new Map(users.map((u) => [u.id, u]));
  const evidenceUserIds = new Set(users.map((u) => u.id));

  // Resolve original user: prefer user_snapshot (historical), fallback to usersMap
  const resolvedShifts: Shift[] = shifts.map((s) => {
    const snap = s.user_snapshot;
    if (snap) {
      const origUserId = s.original_user_id || s.user_id;
      return {
        ...s,
        user_id: origUserId,
        user: {
          id: origUserId,
          f_name: snap.f_name,
          l_name: snap.l_name,
          prefix: snap.prefix,
          role: snap.role,
          pha_id: snap.pha_id,
          salary_number: snap.salary_number,
          nickname: snap.nickname,
        } as any,
      };
    }
    const origUserId = s.original_user_id;
    if (!origUserId || origUserId === s.user_id) return s;
    const origUser = usersMap.get(origUserId);
    if (!origUser) return s;
    return {
      ...s,
      user_id: origUserId,
      user: {
        id: origUserId,
        f_name: origUser.f_name,
        l_name: origUser.l_name,
        prefix: origUser.prefix,
        role: origUser.role,
        pha_id: origUser.pha_id,
        salary_number: origUser.salary_number,
        nickname: origUser.nickname,
      } as any,
    };
  }).filter((s) => !!s.user_id && evidenceUserIds.has(s.user_id));

  await exportCompensationExcel(resolvedShifts, year, month, true, users, compensationRates);
}

export async function exportCompensationExcel(
  shifts: Shift[],
  year: number,
  month: number,
  isEvidence = false,
  evidenceUsers: ExportUserInfo[] = [],
  compensationRates?: CompensationRatesMap,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NTogether';
  workbook.created = new Date();
  const rateMap = normalizeCompensationRates(
    compensationRates ? compensationRatesToRows(compensationRates) : undefined,
  );

  const monthName = format(new Date(year, month - 1), 'MMMM', { locale: th });
  const bweYear = year + 543;

  const daysInMonth = getDaysInMonth(year, month);

  const titlePrefix = isEvidence
    ? 'หลักฐานการจัดเจ้าหน้าที่ขึ้นปฏิบัติงานนอกเวลาราชการ ของเจ้าหน้าที่กลุ่มงานเภสัชกรรมโรงพยาบาลอุตรดิตถ์'
    : 'หลักฐานการจ่ายเงินค่าตอบแทนของข้าราชการที่ปฏิบัติงานนอกเวลาราชการ  กลุ่มงานเภสัชกรรม   โรงพยาบาลอุตรดิตถ์';

  // Group configurations
  const sheetConfigs = [
    {
      name: 'รุ่งอรุณ',
      title: `${titlePrefix} (เวรรุ่งอรุณ)`,
      rateColLabel: 'อัตรา\nต่อชม.',
      totalColLabel: 'รวม\n\nชม.',
      getRate: (role: string) => getCompensationRate(rateMap, 'rung_arun', role),
      filter: (s: Shift) => s.shift_type === 'รุ่งอรุณ',
      getValue: () => 1.5, // 1.5 hours per shift
      note: 'คลินิกรุ่งอรุณ 07.00 น.- 08.30 น. (ยกเว้นวันเสาร์,อาทิตย์และวันหยุดราชการ)',
    },
    {
      name: 'โครงการ',
      title: `${titlePrefix}  (เวรโครงการพิเศษ)`,
      rateColLabel: 'อัตรา\nต่อชม.',
      totalColLabel: 'รวม\n\nชม.',
      getRate: (role: string) => getCompensationRate(rateMap, 'project', role),
      filter: (s: Shift) => getDeptName(s) === 'โครงการ',
      getValue: () => 4, // 4 hours per shift
      note: 'โครงการพิเศษ (คพ) คลินิกนอกเวลาราชการ 16.30 น. - 20.30 น. ยกเว้นวันเสาร์, อาทิตย์ และวันหยุดราชการ  =  08.30 น. - 12.30 น.',
    },
    {
      name: 'เช้า-บ่าย-ดึก',
      title: `${titlePrefix}  (เช้า บ่าย ดึก)`,
      rateColLabel: 'อัตรา\nต่อเวร',
      totalColLabel: 'รวม\n\nเวร',
      getRate: (role: string) => getCompensationRate(rateMap, 'regular', role),
      filter: (s: Shift) => ['เช้า', 'บ่าย', 'ดึก'].includes(s.shift_type) && !['โครงการ', 'SMC', 'Chemo'].includes(getDeptName(s)),
      getValue: () => 1, // 1 shift
      getCode: getShiftCode,
      note: 'เวรดึก(ด) = 00.30 น. - 08.30 น.     เวรเช้า(ช) = 08.30 น. - 16.30 น.     เวรบ่าย(บ)  = 16.30 น. - 00.30 น.',
    },
    {
      name: 'SMC',
      title: `${titlePrefix} (พิเศษ SMC)`,
      rateColLabel: 'อัตรา\nต่อเวร',
      totalColLabel: 'รวม\n\nเวร',
      getRate: (role: string) => getCompensationRate(rateMap, 'smc', role),
      filter: (s: Shift) => getDeptName(s) === 'SMC',
      getValue: () => 1, // 1 shift
      getCode: () => 'บ',
      note: 'ปฏิบัติงานตึกผู้ป่วยนอก (OPD) บ = 16.30 น. - 20.30 น.',
    },
    {
      name: 'Chemo',
      title: isEvidence
        ? 'หลักฐานการจัดเจ้าหน้าที่ขึ้นปฏิบัติงานนอกเวลาราชการ ของเจ้าหน้าที่....งานผลิตยาปราศจากเชื้อ...(เคมีบำบัด).....โรงพยาบาลอุตรดิตถ์'
        : 'หลักฐานการจ่ายเงินค่าตอบแทนการปฏิบัติงานนอกเวลาราชการ ของเจ้าหน้าที่....งานผลิตยาปราศจากเชื้อ...(เคมีบำบัด).....โรงพยาบาลอุตรดิตถ์',
      rateColLabel: 'อัตรา\nต่อเวร',
      totalColLabel: 'รวม\n\nเวร',
      getRate: (role: string) => getCompensationRate(rateMap, 'chemo', role),
      filter: (s: Shift) => getDeptName(s) === 'Chemo',
      getValue: () => 1, // 1 shift
      note: 'ช่วงเวลาปฏิบัติงาน 08.30 น. - 12.30 น.',
    },
  ];

  for (const config of sheetConfigs) {
    const worksheet = workbook.addWorksheet(config.name, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    });

    // 1. Process Data
    const relevantShifts = shifts.filter(config.filter);
    const userMap = new Map<string, UserRowData>();
    if (isEvidence) {
      evidenceUsers.forEach((user) => {
        userMap.set(user.id, buildUserRowData(user));
      });
    }

    for (const s of relevantShifts) {
      if (!s.user_id) continue;
      // เวรดึก ปฏิบัติงานถึง 08.30 ของวันถัดไป → นับเป็นวันถัดไป
      const shiftDate = new Date(s.date);
      if (s.shift_type === 'ดึก') shiftDate.setDate(shiftDate.getDate() + 1);
      // ถ้า shift ข้ามเดือน (เช่น ดึกวันสุดท้ายของเดือน) ให้ข้ามไป
      if (shiftDate.getMonth() + 1 !== month) continue;
      const day = shiftDate.getDate();
      
      let userRow = userMap.get(s.user_id);
      if (!userRow) {
        const prefix = s.user?.prefix || s.user_prefix || '';
        const fName = s.user?.f_name || (s as any).user_f_name || '';
        const lName = s.user?.l_name || (s as any).user_l_name || '';
        const firstName = `${prefix}${fName}`.trim() || s.user?.nickname || s.user_nickname || 'ไม่ทราบชื่อ';
        const lastName = lName;
        const salaryNumber = s.user?.salary_number || '';

        const role = s.user?.role || 'pharmacist';
        const phaIdRaw = s.user?.pha_id ?? 0;
        const phaId = typeof phaIdRaw === 'number'
          ? phaIdRaw
          : parseInt(String(phaIdRaw).replace(/\D/g, ''), 10) || 0;

        userRow = {
          userId: s.user_id,
          firstName,
          lastName,
          salaryNumber: salaryNumber,
          role,
          phaId,
          days: {},
          totalValue: 0,
          totalAmount: 0,
        };
        userMap.set(s.user_id, userRow);
      }

      const val = config.getValue();
      const code = config.getCode ? config.getCode(s) : undefined;
      
      if (!userRow.days[day]) userRow.days[day] = [];
      userRow.days[day].push({ val, code });

      userRow.totalValue += val;
      userRow.totalAmount += val * config.getRate(userRow.role);
    }

    const roleOrder: Record<string, number> = { pharmacist: 0, pharmacy_technician: 1, officer: 2 };
    const rowsData = Array.from(userMap.values())
      .filter(u => isEvidence || u.totalValue > 0)
      .sort((a, b) => {
        const roleDiff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
        if (roleDiff !== 0) return roleDiff;
        return a.phaId - b.phaId;
      });

    // 2. Setup Columns: 39 cols (evidence) or 40 cols with signature (compensation)
    const totalCols = isEvidence ? 39 : 40;
    const lastColLetter = isEvidence ? 'AM' : 'AN';
    const amountCol = 39;
    const totalValueCol = 38;
    const totalValueColLetter = excelCol(totalValueCol);
    const amountColLetter = excelCol(amountCol);
    const rateColLetter = excelCol(6);
    const summaryMergeEnd = 'AK';

    const columns = [
      { key: 'seq', width: 4.5 },
      { key: 'salaryNo', width: 9 },
      { key: 'firstName', width: 13 },
      { key: 'lastName', width: 12 },
      { key: 'position', width: 8 },
      { key: 'rate', width: 6 },
    ];
    for (let i = 1; i <= 31; i++) {
      columns.push({ key: `d${i}`, width: 3.5 });
    }
    columns.push({ key: 'totalValue', width: 5 });
    columns.push({ key: 'totalAmount', width: 8.5 });
    if (!isEvidence) columns.push({ key: 'signature', width: 15 });

    worksheet.columns = columns;

    // Default font
    worksheet.getColumn('salaryNo').font = { name: 'TH SarabunPSK', size: 16 };
    
    const isRegularShift = config.name === 'เช้า-บ่าย-ดึก';
    const isHourlySheet = config.rateColLabel.includes('ต่อชม.');
    const rowsPerPage = isRegularShift ? 10 : 15;
    const totalPages = Math.ceil(rowsData.length / rowsPerPage) || 1;

    // For "เช้า-บ่าย-ดึก" sheet: order shifts within a day by start time
    // (ดึก เร็วสุดของวันที่นับ → เช้า → บ่าย)
    const getEntryOrder = (e: DayEntry): number => {
      const code = e.code || '';
      if (code === 'ด') return 0;
      if (code.startsWith('ช')) return 1;
      if (code.startsWith('บ')) return 2;
      return 3;
    };

    let grandTotalValue = 0;
    let grandTotalAmount = 0;
    let previousSummaryRowNumber: number | null = null;

    for (let page = 0; page < totalPages; page++) {
      const pageData = rowsData.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
      const pageTotalRows: number[] = [];
      let carriedRowNumber: number | null = null;

      if (page > 0) {
        worksheet.addRow([]); // empty row separator
        const pageNumRow = worksheet.addRow([]);
        pageNumRow.getCell(amountCol).value = `หน้า ${page + 1}`;
        pageNumRow.font = { name: 'TH SarabunPSK', size: 16 };
        pageNumRow.alignment = { horizontal: 'right' };
        worksheet.mergeCells(`A${pageNumRow.number}:${lastColLetter}${pageNumRow.number}`);
      }

      // 3. Build Headers
      // Row 1: Title
      const titleRow = worksheet.addRow([config.title]);
      titleRow.height = 25;
      titleRow.font = { name: 'TH SarabunPSK', size: 18, bold: true };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells(`A${titleRow.number}:${lastColLetter}${titleRow.number}`);

      // Row 2: Month/Year
      const subtitleRow = worksheet.addRow([`ประจำเดือน......${monthName}...........พ.ศ.............${bweYear}.........`]);
      subtitleRow.height = 25;
      subtitleRow.font = { name: 'TH SarabunPSK', size: 18, bold: true };
      subtitleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells(`A${subtitleRow.number}:${lastColLetter}${subtitleRow.number}`);

      if (page > 0) {
        const carriedRow = worksheet.addRow([]);
        carriedRowNumber = carriedRow.number;
        carriedRow.getCell(33).value = 'ยอดยกมา';
        carriedRow.getCell(totalValueCol).value = previousSummaryRowNumber
          ? { formula: `${totalValueColLetter}${previousSummaryRowNumber}`, result: grandTotalValue }
          : grandTotalValue;
        carriedRow.getCell(amountCol).value = previousSummaryRowNumber
          ? { formula: `${amountColLetter}${previousSummaryRowNumber}`, result: grandTotalAmount }
          : grandTotalAmount;
        carriedRow.font = { name: 'TH SarabunPSK', size: 16, bold: true };
        carriedRow.eachCell((cell, colNumber) => {
          if (colNumber === amountCol) cell.numFmt = '#,##0.00';
          if (colNumber === totalValueCol || colNumber === amountCol || colNumber === 33) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      }

      // Row 3 to 5: Complex Headers
      const headerRow1 = worksheet.addRow([
        'ลำดับ\nที่', 'เลขที่รับ\nเงินเดือน', 'ชื่อ-สกุล', '', 'ตำ\nแหน่ง', config.rateColLabel,
        'วันที่ปฏิบัติงาน', ...Array(30).fill(''),
        'รวม\n\n' + (config.name === 'รุ่งอรุณ' || config.name === 'โครงการ' ? 'ชม.' : 'เวร'),
        'จำนวน\n\nเงิน',
        ...(!isEvidence ? ['ลงชื่อผู้รับเงิน\n\nขอรับรองว่า\nได้ปฏิบัติงานจริง'] : []),
      ]);
      headerRow1.height = 30;
      const headerRow2 = worksheet.addRow([
        '', '', '', '', '', '',
        ...Array.from({ length: 31 }, (_, i) => i + 1),
        '', '',
        ...(!isEvidence ? [''] : []),
      ]);
      const headerRow3 = worksheet.addRow(new Array(totalCols).fill(''));

      const startR = headerRow1.number;

      // Merge complex headers
      worksheet.mergeCells(startR, 1, startR + 2, 1);
      worksheet.mergeCells(startR, 2, startR + 2, 2);
      worksheet.mergeCells(startR, 3, startR + 2, 4); // "ชื่อ-สกุล" spanning 2 cols across all 3 header rows
      worksheet.mergeCells(startR, 5, startR + 2, 5);
      worksheet.mergeCells(startR, 6, startR + 2, 6);

      worksheet.mergeCells(startR, 7, startR, 37); // "วันที่ปฏิบัติงาน" spanning G to AK
      for (let i = 0; i < 31; i++) {
         const colNum = 7 + i;
         worksheet.mergeCells(startR + 1, colNum, startR + 2, colNum);
      }

      worksheet.mergeCells(startR, 38, startR + 2, 38);
      worksheet.mergeCells(startR, 39, startR + 2, 39);
      if (!isEvidence) worksheet.mergeCells(startR, 40, startR + 2, 40);

      // Header Styles
      [headerRow1, headerRow2, headerRow3].forEach(row => {
        row.font = { name: 'TH SarabunPSK', size: 16, bold: true };
        row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= totalCols) {
            cell.border = {
              top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
            };
          }
        });
      });

      // 4. Fill Data Rows
      pageData.forEach((row, idx) => {
        const runningSeq = (page * rowsPerPage) + idx + 1;
        grandTotalValue += row.totalValue;
        grandTotalAmount += row.totalAmount;

        if (isRegularShift) {
          // Split each user into 2 rows. Per day, sort shifts by start time
          // (ด → ช → บ). First (earliest) goes to row 1, next to row 2.
          const positionLabel = row.role === 'pharmacist' ? 'เภสัชกร' :
                                row.role === 'pharmacy_technician' ? 'จพ.เภสัช' : 'เจ้าหน้าที่';
          const rate = config.getRate(row.role);

          const slot1: (string | null)[] = [];
          const slot2: (string | null)[] = [];
          let shiftedMorningCount = 0;
          let afternoonCount = 0;

          // แถวบน = ดึก (หรือเช้า ถ้าไม่มีดึก), แถวล่าง = เช้าหลังดึก + บ่าย
          for (let i = 1; i <= 31; i++) {
            const entries = (row.days[i] || []).slice().sort((a, b) => getEntryOrder(a) - getEntryOrder(b));
            const nightCodes = entries.filter(e => e.code === 'ด').map(e => e.code || '').filter(Boolean);
            const morningCodes = entries.filter(e => {
              const order = getEntryOrder(e);
              return order === 1;
            }).map(e => e.code || '').filter(Boolean);
            const afternoonCodes = entries.filter(e => getEntryOrder(e) === 2).map(e => e.code || '').filter(Boolean);

            const hasNight = nightCodes.length > 0;
            const topCodes = hasNight ? nightCodes : morningCodes;
            const bottomCodes = hasNight ? [...morningCodes, ...afternoonCodes] : afternoonCodes;

            if (hasNight && morningCodes.length > 0) shiftedMorningCount++;
            if (afternoonCodes.length > 0) afternoonCount++;

            slot1.push(topCodes.join('/') || null);
            slot2.push(bottomCodes.join('/') || null);
          }

          const count1 = slot1.filter(Boolean).length + shiftedMorningCount;
          const count2 = afternoonCount;
          const total1 = count1 * rate;
          const total2 = count2 * rate;

          const buildRow = (slotVals: (string | null)[], isFirst: boolean) => {
            const rowValues: any[] = [
              isFirst ? runningSeq : '',
              isFirst ? row.salaryNumber : '',
              isFirst ? row.firstName : '',
              isFirst ? row.lastName : '',
              isFirst ? positionLabel : '',
              rate,
            ];
            for (const v of slotVals) rowValues.push(v);
            rowValues.push('');
            rowValues.push('');
            if (!isEvidence) rowValues.push('');

            const dRow = worksheet.addRow(rowValues);
            dRow.height = 22;
            dRow.font = { name: 'TH SarabunPSK', size: 16 };
            dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              if (colNumber <= totalCols) {
                cell.alignment = { horizontal: (colNumber === 3 || colNumber === 4) ? 'left' : 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                if (colNumber === amountCol) cell.numFmt = '#,##0.00';
              }
            });
            return dRow;
          };

          const r1 = buildRow(slot1, true);
          const r2 = buildRow(slot2, false);
          const shiftedMorningFormula = `COUNTIF(${dayRange(r2.number)},"*ช*")`;
          const afternoonFormula = `COUNTIF(${dayRange(r2.number)},"*บ*")`;
          const totalFormula1 = `${nonBlankCountFormula(r1.number)}+${shiftedMorningFormula}`;
          const totalFormula2 = afternoonFormula;

          r1.getCell(totalValueCol).value = {
            formula: guardedFormula(totalFormula1, r1.number),
            result: count1,
          } as any;
          r1.getCell(amountCol).value = {
            formula: `${totalValueColLetter}${r1.number}*${rateColLetter}${r1.number}`,
            result: total1,
          } as any;
          r2.getCell(totalValueCol).value = {
            formula: guardedFormula(totalFormula2, r2.number),
            result: count2,
          } as any;
          r2.getCell(amountCol).value = {
            formula: `${totalValueColLetter}${r2.number}*${rateColLetter}${r2.number}`,
            result: total2,
          } as any;
          pageTotalRows.push(r1.number, r2.number);

          // Merge seq, salaryNo, firstName, lastName, position, and signature across the 2 rows
          const mergedCols = isEvidence ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 40];
          for (const col of mergedCols) {
            worksheet.mergeCells(r1.number, col, r2.number, col);
          }
        } else {
          // Output 1 row
          const positionLabel = row.role === 'pharmacist' ? 'เภสัชกร' :
                                row.role === 'pharmacy_technician' ? 'จพ.เภสัช' : 'เจ้าหน้าที่';
          const rowValues: any[] = [
            runningSeq,
            row.salaryNumber, // salaryNo
            row.firstName,
            row.lastName,
            positionLabel,
            config.getRate(row.role),
          ];

          for (let i = 1; i <= 31; i++) {
            const entries = row.days[i] || [];
            if (config.getCode) {
              const codes = entries.map(e => e.code || '').filter(Boolean).join('/');
              rowValues.push(codes || null);
            } else {
              const sumVal = entries.reduce((acc, curr) => acc + curr.val, 0);
              rowValues.push(sumVal > 0 ? sumVal : null);
            }
          }

          rowValues.push('');
          rowValues.push('');
          if (!isEvidence) rowValues.push('');

          const dRow = worksheet.addRow(rowValues);
          const totalFormula = isHourlySheet
            ? `SUM(${dayRange(dRow.number)})`
            : nonBlankCountFormula(dRow.number);
          dRow.getCell(totalValueCol).value = {
            formula: guardedFormula(totalFormula, dRow.number),
            result: row.totalValue,
          } as any;
          dRow.getCell(amountCol).value = {
            formula: `${totalValueColLetter}${dRow.number}*${rateColLetter}${dRow.number}`,
            result: row.totalAmount,
          } as any;
          pageTotalRows.push(dRow.number);
          dRow.height = 22;
          dRow.font = { name: 'TH SarabunPSK', size: 16 };

          dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber <= totalCols) {
              cell.alignment = { horizontal: (colNumber === 3 || colNumber === 4) ? 'left' : 'center', vertical: 'middle' };
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
              if (colNumber === amountCol) {
                cell.numFmt = '#,##0.00';
              } else if (colNumber >= 7 && colNumber <= 37 && typeof cell.value === 'number') {
                if (cell.value % 1 !== 0) {
                  cell.numFmt = '0.0#'; // Forces 1.5 to not round
                } else {
                  cell.numFmt = '0'; // Whole numbers stay whole
                }
              }
            }
          });
        }
      });

      // 5. Summary Row (Thai Baht Text)
      const formulaRows = [
        ...(carriedRowNumber ? [carriedRowNumber] : []),
        ...pageTotalRows,
      ];
      const totalValueFormula = formulaRows.length
        ? `SUM(${totalValueColLetter}${formulaRows[0]}:${totalValueColLetter}${formulaRows[formulaRows.length - 1]})`
        : '0';
      const amountFormula = formulaRows.length
        ? `SUM(${amountColLetter}${formulaRows[0]}:${amountColLetter}${formulaRows[formulaRows.length - 1]})`
        : '0';
      const summaryValues = new Array(totalCols).fill('');
      summaryValues[0] = toThaiBahtText(grandTotalAmount);
      summaryValues[totalValueCol - 1] = { formula: totalValueFormula, result: grandTotalValue };
      summaryValues[amountCol - 1] = { formula: amountFormula, result: grandTotalAmount };

      const summaryRow = worksheet.addRow(summaryValues);
      previousSummaryRowNumber = summaryRow.number;
      summaryRow.height = 25;
      worksheet.mergeCells(`A${summaryRow.number}:${summaryMergeEnd}${summaryRow.number}`);
      summaryRow.font = { name: 'TH SarabunPSK', size: 16, bold: true };
      summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= totalCols) {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
          };
          if (colNumber === 1 || colNumber === totalValueCol || colNumber === amountCol) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
          if (colNumber === amountCol) cell.numFmt = '#,##0.00';
        }
      });

      // 6. Signatures and Notes
      worksheet.addRow([]);

      const noteRow = worksheet.addRow([]);
      noteRow.getCell(1).value = 'หมายเหตุ';
      if ((config as any).note) {
        noteRow.getCell(7).value = (config as any).note;
      }
      noteRow.font = { name: 'TH SarabunPSK', size: 16 };

      if (!isEvidence) {
        worksheet.addRow([]); // empty row
        const certRow = worksheet.addRow([]);
        certRow.getCell(2).value = 'ขอรับรองว่าได้ปฏิบัติงานจริง';
        certRow.getCell(30).value = 'ขอรับรองว่าได้ปฏิบัติงานจริง';
        certRow.font = { name: 'TH SarabunPSK', size: 16 };
        certRow.alignment = { horizontal: 'center' };
        worksheet.mergeCells(`B${certRow.number}:J${certRow.number}`);
        worksheet.mergeCells(`AD${certRow.number}:AN${certRow.number}`);
        worksheet.addRow([]); // empty row
        const signRow1 = worksheet.addRow([]);
        // Position column (2)
        if (config.name === 'Chemo' || config.name === 'ส่งยา สอ.') {
          signRow1.getCell(2).value = 'ลงชื่อ..............................................................หัวหน้างาน';
        } else {
          signRow1.getCell(2).value = 'ลงชื่อ..............................................................ผู้ตรวจสอบ';
        }
        signRow1.getCell(30).value = 'ลงชื่อ..............................................................หัวหน้ากลุ่มงาน';
        signRow1.font = { name: 'TH SarabunPSK', size: 16 };
        signRow1.alignment = { horizontal: 'center' };
        worksheet.mergeCells(`B${signRow1.number}:J${signRow1.number}`);
        worksheet.mergeCells(`AD${signRow1.number}:AN${signRow1.number}`);

        const signRow2 = worksheet.addRow([]);
        // Name column (2)
        if (config.name === 'Chemo' || config.name === 'ส่งยา สอ.') {
          signRow2.getCell(2).value = '(นางแสงเธียร คณิตปัญญาเจริญ)';
        } else {
          signRow2.getCell(2).value = '(นายอภิเสก คงศิริ)';
        }
        signRow2.getCell(30).value = '(นางมัณทนา คันทะเรศร์)';
        signRow2.font = { name: 'TH SarabunPSK', size: 16 };
        signRow2.alignment = { horizontal: 'center' };
        worksheet.mergeCells(`B${signRow2.number}:J${signRow2.number}`);
        worksheet.mergeCells(`AD${signRow2.number}:AN${signRow2.number}`);

        worksheet.addRow([]); // empty row
        worksheet.addRow([]); // empty row
        const signRow3 = worksheet.addRow([]);
        signRow3.getCell(16).value = 'ลงชื่อ..............................................................ผู้จ่ายเงิน';
        signRow3.font = { name: 'TH SarabunPSK', size: 16 };
        signRow3.alignment = { horizontal: 'center' };
        worksheet.mergeCells(`P${signRow3.number}:AB${signRow3.number}`);
      } else {
        // Evidence export should stop after the note row.
        worksheet.addRow([]);
      }

      // Add actual Excel page break if there's a next page
      if (page < totalPages - 1) {
        worksheet.addRow([]); // empty spacing
        const br = worksheet.lastRow!.number;
        worksheet.getRow(br).addPageBreak();
      }
    }
  }

  // Write and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = isEvidence
    ? `หลักฐานการจัดตารางเวร_${monthName}_${bweYear}.xlsx`
    : `หลักฐานค่าตอบแทน_${monthName}_${bweYear}.xlsx`;
  saveAs(blob, filename);
}
