import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Shift } from '@/lib/types';
import { exportCompensationExcel } from '@/lib/excelExport';
import { toastError } from '@/lib/swal';

interface Props {
  shifts: Shift[];
  year: number;
  month: number;
}

export function ExcelExportButton({ shifts, year, month }: Props) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportCompensationExcel(shifts, year, month);
    } catch (error) {
      console.error('Excel Export Error:', error);
      await toastError('เกิดข้อผิดพลาดในการสร้างไฟล์ Excel');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 font-medium px-4 py-2 rounded-xl text-sm transition-colors shadow-sm flex items-center gap-2"
    >
      {isExporting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      Excel (ค่าตอบแทน)
    </button>
  );
}
