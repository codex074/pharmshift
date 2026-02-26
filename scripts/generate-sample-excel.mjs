import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Define the headers based on the sample image and instructions
// Row 1: Headers starting with empty, then dates 1 to 31
const headers = ['phaID / Name'];
for (let i = 1; i <= 31; i++) {
  headers.push(i.toString());
}

// Create sample rows
const sampleRows = [
  ['pha001', 'smc', '', 'S', '', '', 'รO', '', 'บE', '', '', 'c', '', '', '', 'd', '', '', 'ด', '', '', 'chem', '', 'Ext', '', 'รH'],
  ['pha002', '', 'บM', '', 'Ext', '', '', 'S', '', 'รE', '', '', 'smc', '', '', '', 'บE', '', '', 'c', '', '', 'd', '', 'ด', ''],
  ['พี่กุส', 'S', '', '', '', 'smc', '', '', '', 'Ext', '', '', '', 'รO', '', '', '', 'บM', '', '', '', 'c', '', '', '', 'd'],
];

// Create worksheet and workbook
const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'ตารางเวร');

// Write to public directory
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const filePath = path.join(publicDir, 'sample_shifts.xlsx');
XLSX.writeFile(wb, filePath);

console.log('Successfully created sample_shifts.xlsx at', filePath);
