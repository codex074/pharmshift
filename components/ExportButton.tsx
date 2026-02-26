'use client';

import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Shift } from '@/lib/types';
import { THAI_MONTHS } from '@/lib/utils';

interface ExportButtonProps {
  shifts: Shift[];
  year: number;
  month: number;
}

export function ExportButton({ shifts, year, month }: ExportButtonProps) {
  function handleExport() {
    try {
      const thaiYear = year + 543;
      const monthName = THAI_MONTHS[month - 1];
      const title = `ตารางเวรเภสัชกร ${monthName} ${thaiYear}`;

      // Build rows
      const rows = shifts
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((s) => {
          const dept = (s.department as { name: string })?.name || '';
          const user = s.user as { name: string; nickname?: string; prefix?: string };
          return {
            วันที่: format(new Date(s.date + 'T00:00:00'), 'd/M/yyyy'),
            แผนก: dept,
            ประเภทเวร: s.shift_type,
            'ชื่อ-นามสกุล': `${user?.prefix || ''}${user?.name || ''}`,
            ชื่อเล่น: user?.nickname || '',
          };
        });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ตารางเวร');

      // Set column widths
      ws['!cols'] = [
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 12 },
      ];

      XLSX.writeFile(wb, `เวรดี๊ดี_${monthName}_${thaiYear}.xlsx`);
      toast.success('ส่งออกข้อมูลเรียบร้อยแล้ว', { description: `${title} — ${rows.length} รายการ` });
    } catch {
      toast.error('ส่งออกข้อมูลไม่สำเร็จ');
    }
  }

  return (
    <button
      id="export-button"
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-md shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200"
    >
      <Download className="w-4 h-4" />
      Export
    </button>
  );
}
