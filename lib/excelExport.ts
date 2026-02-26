import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Shift } from './types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

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
  fullName: string;
  days: Record<number, DayEntry[]>;
  totalValue: number;
  totalAmount: number;
}

export async function exportCompensationExcel(shifts: Shift[], year: number, month: number) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NTogether';
  workbook.created = new Date();

  const monthName = format(new Date(year, month - 1), 'MMMM', { locale: th });
  const bweYear = year + 543;

  const daysInMonth = getDaysInMonth(year, month);

  // Group configurations
  const sheetConfigs = [
    {
      name: 'รุ่งอรุณ',
      title: 'หลักฐานการจ่ายเงินค่าตอบแทนของข้าราชการที่ปฏิบัติงานนอกเวลาราชการ  กลุ่มงานเภสัชกรรม   โรงพยาบาลอุตรดิตถ์ (เวรรุ่งอรุณ)',
      rateColLabel: 'อัตรา\nต่อชม.',
      totalColLabel: 'รวม\n\nชม.',
      rate: 135,
      filter: (s: Shift) => s.shift_type === 'รุ่งอรุณ',
      getValue: () => 1.5, // 1.5 hours per shift
    },
    {
      name: 'โครงการ',
      title: 'หลักฐานการจ่ายเงินค่าตอบแทนของข้าราชการที่ปฏิบัติงานนอกเวลาราชการ  กลุ่มงานเภสัชกรรม   โรงพยาบาลอุตรดิตถ์  (เวรโครงการพิเศษ)',
      rateColLabel: 'อัตรา\nต่อชม.',
      totalColLabel: 'รวม\n\nชม.',
      rate: 135,
      filter: (s: Shift) => getDeptName(s) === 'โครงการ',
      getValue: () => 4, // 4 hours per shift
      note: '- ช่วงเวลาการปฏิบัติงาน 08.30 น. - 12.30 น.',
    },
    {
      name: 'เช้า-บ่าย-ดึก',
      title: 'หลักฐานการจ่ายเงินค่าตอบแทนของข้าราชการที่ปฏิบัติงานนอกเวลาราชการ  กลุ่มงานเภสัชกรรม   โรงพยาบาลอุตรดิตถ์  (เช้า บ่าย ดึก)',
      rateColLabel: 'อัตรา\nต่อเวร',
      totalColLabel: 'รวม\n\nเวร',
      rate: 780,
      filter: (s: Shift) => ['เช้า', 'บ่าย', 'ดึก'].includes(s.shift_type) && !['โครงการ', 'SMC', 'Chemo'].includes(getDeptName(s)),
      getValue: () => 1, // 1 shift
      getCode: getShiftCode,
    },
    {
      name: 'SMC',
      title: 'หลักฐานการจ่ายเงินค่าตอบแทนของข้าราชการที่ปฏิบัติงานนอกเวลาราชการ  กลุ่มงานเภสัชกรรม   โรงพยาบาลอุตรดิตถ์ (พิเศษ SMC)',
      rateColLabel: 'อัตรา\nต่อเวร',
      totalColLabel: 'รวม\n\nเวร',
      rate: 900,
      filter: (s: Shift) => getDeptName(s) === 'SMC',
      getValue: () => 1, // 1 shift
    },
    {
      name: 'Chemo',
      title: 'หลักฐานการจ่ายเงินค่าตอบแทนการปฏิบัติงานนอกเวลาราชการ ของเจ้าหน้าที่....งานผลิตยาปราศจากเชื้อ...(เคมีบำบัด).....โรงพยาบาลอุตรดิตถ์',
      rateColLabel: 'อัตรา\nต่อเวร',
      totalColLabel: 'รวม\n\nเวร',
      rate: 390,
      filter: (s: Shift) => getDeptName(s) === 'Chemo',
      getValue: () => 1, // 1 shift
    },
  ];

  for (const config of sheetConfigs) {
    const worksheet = workbook.addWorksheet(config.name, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    });

    // 1. Process Data
    const relevantShifts = shifts.filter(config.filter);
    const userMap = new Map<string, UserRowData>();

    for (const s of relevantShifts) {
      if (!s.user_id) continue;
      const day = new Date(s.date).getDate();
      
      let userRow = userMap.get(s.user_id);
      if (!userRow) {
        const targetName = s.user?.name || s.user_name || '';
        const prefix = s.user?.prefix || s.user_prefix || '';
        const generatedFullName = `${prefix}${targetName}`.trim() || s.user?.nickname || s.user_nickname || 'ไม่ทราบชื่อ';
        
        userRow = {
          userId: s.user_id,
          fullName: generatedFullName,
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
      userRow.totalAmount += val * config.rate;
    }

    const rowsData = Array.from(userMap.values())
      .filter(u => u.totalValue > 0)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'th'));

    // 2. Setup Columns matching 39 total columns (A to AM)
    const columns = [
      { key: 'seq', width: 4.5 },
      { key: 'salaryNo', width: 9 },
      { key: 'name', width: 22 },
      { key: 'position', width: 8 },
      { key: 'rate', width: 6 },
    ];
    for (let i = 1; i <= 31; i++) {
      columns.push({ key: `d${i}`, width: 3.5 });
    }
    columns.push({ key: 'totalValue', width: 5 });
    columns.push({ key: 'totalAmount', width: 8.5 });
    columns.push({ key: 'signature', width: 15 });

    worksheet.columns = columns;

    // Default font
    worksheet.getColumn('salaryNo').font = { name: 'TH SarabunPSK', size: 16 };
    
    const isRegularShift = config.name === 'เช้า-บ่าย-ดึก';
    const rowsPerPage = isRegularShift ? 11 : 15;
    const totalPages = Math.ceil(rowsData.length / rowsPerPage) || 1;

    let grandTotalValue = 0;
    let grandTotalAmount = 0;

    for (let page = 0; page < totalPages; page++) {
      const pageData = rowsData.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

      if (page > 0) {
        worksheet.addRow([]); // empty row separator
        const pageNumRow = worksheet.addRow([]);
        pageNumRow.getCell(39).value = `หน้า ${page + 1}`;
        pageNumRow.font = { name: 'TH SarabunPSK', size: 16 };
        pageNumRow.alignment = { horizontal: 'right' };
        worksheet.mergeCells(`A${pageNumRow.number}:AM${pageNumRow.number}`);
      }

      // 3. Build Headers
      // Row 1: Title
      const titleRow = worksheet.addRow([config.title]);
      titleRow.height = 25;
      titleRow.font = { name: 'TH SarabunPSK', size: 18, bold: true };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells(`A${titleRow.number}:AM${titleRow.number}`);

      // Row 2: Month/Year
      const subtitleRow = worksheet.addRow([`ประจำเดือน......${monthName}...........พ.ศ.............${bweYear}.........`]);
      subtitleRow.height = 25;
      subtitleRow.font = { name: 'TH SarabunPSK', size: 18, bold: true };
      subtitleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells(`A${subtitleRow.number}:AM${subtitleRow.number}`);

      if (page > 0) {
        const carriedRow = worksheet.addRow([]);
        carriedRow.getCell(32).value = 'ยอดยกมา';
        carriedRow.getCell(38).value = grandTotalValue;
        carriedRow.getCell(39).value = grandTotalAmount;
        carriedRow.font = { name: 'TH SarabunPSK', size: 16, bold: true };
        carriedRow.eachCell((cell, colNumber) => {
          if (colNumber === 39) cell.numFmt = '#,##0.00';
          if (colNumber === 38 || colNumber === 39 || colNumber === 32) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      }

      // Row 3 to 5: Complex Headers
      const headerRow1 = worksheet.addRow([
        'ลำดับ\nที่', 'เลขที่รับ\nเงินเดือน', 'ชื่อ-สกุล', 'ตำ\nแหน่ง', config.rateColLabel, 
        'วันที่ปฏิบัติงาน', ...Array(30).fill(''), 'รวม\n\n' + (config.name === 'รุ่งอรุณ' || config.name === 'โครงการ' ? 'ชม.' : 'เวร'), 'จำนวน\n\nเงิน', 'ลงชื่อผู้รับเงิน\n\nขอรับรองว่า\nได้ปฏิบัติงานจริง'
      ]);
      headerRow1.height = 30;
      const headerRow2 = worksheet.addRow([
        '', '', '', '', '',
        ...Array.from({ length: 31 }, (_, i) => i + 1),
        '', '', ''
      ]);
      const headerRow3 = worksheet.addRow(new Array(39).fill(''));

      const startR = headerRow1.number;

      // Merge complex headers
      worksheet.mergeCells(startR, 1, startR + 2, 1);
      worksheet.mergeCells(startR, 2, startR + 2, 2);
      worksheet.mergeCells(startR, 3, startR + 2, 3);
      worksheet.mergeCells(startR, 4, startR + 2, 4);
      worksheet.mergeCells(startR, 5, startR + 2, 5);
      
      worksheet.mergeCells(startR, 6, startR, 36); // "วันที่ปฏิบัติงาน" spanning F to AJ
      for (let i = 0; i < 31; i++) {
         const colNum = 6 + i;
         worksheet.mergeCells(startR + 1, colNum, startR + 2, colNum); 
      }

      worksheet.mergeCells(startR, 37, startR + 2, 37);
      worksheet.mergeCells(startR, 38, startR + 2, 38);
      worksheet.mergeCells(startR, 39, startR + 2, 39);

      // Header Styles
      [headerRow1, headerRow2, headerRow3].forEach(row => {
        row.font = { name: 'TH SarabunPSK', size: 16, bold: true };
        row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= 39) {
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
          // Output 2 rows.
          const rowValues1: any[] = [runningSeq, '', row.fullName, 'เภสัชกร', config.rate];
          const rowValues2: any[] = ['', '', '', '', ''];

          for (let i = 1; i <= 31; i++) {
            const entries = row.days[i] || [];
            rowValues1.push(entries[0]?.code || entries[0]?.val || '');
            rowValues2.push(entries[1]?.code || entries[1]?.val || '');
          }

          rowValues1.push(row.totalValue);
          rowValues1.push(row.totalAmount);
          rowValues1.push('');

          rowValues2.push('');
          rowValues2.push('');
          rowValues2.push('');

          const dRow1 = worksheet.addRow(rowValues1);
          const dRow2 = worksheet.addRow(rowValues2);
          dRow1.height = 22;
          dRow2.height = 22;
          
          // Merge identical user info cells vertically
          worksheet.mergeCells(`A${dRow1.number}:A${dRow2.number}`);
          worksheet.mergeCells(`B${dRow1.number}:B${dRow2.number}`);
          worksheet.mergeCells(`C${dRow1.number}:C${dRow2.number}`);
          worksheet.mergeCells(`D${dRow1.number}:D${dRow2.number}`);
          worksheet.mergeCells(`E${dRow1.number}:E${dRow2.number}`);
          worksheet.mergeCells(`AK${dRow1.number}:AK${dRow2.number}`);
          worksheet.mergeCells(`AL${dRow1.number}:AL${dRow2.number}`);
          worksheet.mergeCells(`AM${dRow1.number}:AM${dRow2.number}`);

          [dRow1, dRow2].forEach(r => {
             r.font = { name: 'TH SarabunPSK', size: 16 };
             r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
               if (colNumber <= 39) {
                 cell.alignment = { horizontal: (colNumber === 3) ? 'left' : 'center', vertical: 'middle' };
                 cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                 if (colNumber === 39) {
                   cell.numFmt = '#,##0.00';
                 }
               }
             });
          });
        } else {
          // Output 1 row
          const rowValues: any[] = [
            runningSeq,
            '', // salaryNo (empty)
            row.fullName,
            'เภสัชกร',
            config.rate,
          ];

          for (let i = 1; i <= 31; i++) {
            const entries = row.days[i] || [];
            const sumVal = entries.reduce((acc, curr) => acc + curr.val, 0);
            rowValues.push(sumVal > 0 ? sumVal : '');
          }

          rowValues.push(row.totalValue);
          rowValues.push(row.totalAmount);
          rowValues.push(''); // signature

          const dRow = worksheet.addRow(rowValues);
          dRow.height = 22;
          dRow.font = { name: 'TH SarabunPSK', size: 16 };
          
          dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber <= 39) {
              cell.alignment = { horizontal: (colNumber === 3) ? 'left' : 'center', vertical: 'middle' };
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
              if (colNumber === 39) {
                cell.numFmt = '#,##0.00';
              } else if (colNumber >= 6 && colNumber <= 37 && typeof cell.value === 'number') {
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
      const summaryValues = new Array(39).fill('');
      summaryValues[0] = toThaiBahtText(grandTotalAmount);
      summaryValues[37] = grandTotalValue;
      summaryValues[38] = grandTotalAmount;
      
      const summaryRow = worksheet.addRow(summaryValues);
      summaryRow.height = 25;
      worksheet.mergeCells(`A${summaryRow.number}:AK${summaryRow.number}`);
      summaryRow.font = { name: 'TH SarabunPSK', size: 16, bold: true };
      summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 39) {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
          };
          if (colNumber === 1 || colNumber === 38 || colNumber === 39) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
          if (colNumber === 39) cell.numFmt = '#,##0.00';
        }
      });

      // 6. Signatures and Notes
      worksheet.addRow([]);

      const noteRow = worksheet.addRow([]);
      noteRow.getCell(1).value = 'หมายเหตุ';
      if ((config as any).note) {
        noteRow.getCell(6).value = (config as any).note;
      }
      noteRow.font = { name: 'TH SarabunPSK', size: 16 };

      worksheet.addRow([]); // empty row

      const certRow = worksheet.addRow([]);
      certRow.getCell(2).value = 'ขอรับรองว่าได้ปฏิบัติงานจริง';
      certRow.getCell(30).value = 'ขอรับรองว่าได้ปฏิบัติงานจริง';
      certRow.font = { name: 'TH SarabunPSK', size: 16 };
      certRow.alignment = { horizontal: 'center' };
      worksheet.mergeCells(`B${certRow.number}:J${certRow.number}`);
      worksheet.mergeCells(`AD${certRow.number}:AM${certRow.number}`);

      worksheet.addRow([]); // empty row

      const signRow1 = worksheet.addRow([]);
      signRow1.getCell(2).value = 'ลงชื่อ..............................................................หัวหน้างาน';
      signRow1.getCell(30).value = 'ลงชื่อ..............................................................หัวหน้ากลุ่มงาน';
      signRow1.font = { name: 'TH SarabunPSK', size: 16 };
      signRow1.alignment = { horizontal: 'center' };
      worksheet.mergeCells(`B${signRow1.number}:J${signRow1.number}`);
      worksheet.mergeCells(`AD${signRow1.number}:AM${signRow1.number}`);
      
      const signRow2 = worksheet.addRow([]);
      signRow2.getCell(2).value = '(นางแสงเธียร คณิตปัญญาเจริญ)';
      signRow2.getCell(30).value = '(นางมัณทนา คันทะเรศร์)';
      signRow2.font = { name: 'TH SarabunPSK', size: 16 };
      signRow2.alignment = { horizontal: 'center' };
      worksheet.mergeCells(`B${signRow2.number}:J${signRow2.number}`);
      worksheet.mergeCells(`AD${signRow2.number}:AM${signRow2.number}`);

      worksheet.addRow([]); // empty row
      worksheet.addRow([]); // empty row

      const signRow3 = worksheet.addRow([]);
      signRow3.getCell(16).value = 'ลงชื่อ..............................................................ผู้จ่ายเงิน';
      signRow3.font = { name: 'TH SarabunPSK', size: 16 };
      signRow3.alignment = { horizontal: 'center' };
      worksheet.mergeCells(`P${signRow3.number}:AB${signRow3.number}`);

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
  saveAs(blob, `หลักฐานค่าตอบแทน_${monthName}_${bweYear}.xlsx`);
}

