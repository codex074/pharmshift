'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toastError, toastSuccess } from '@/lib/swal';
import { exportScheduleTable } from '@/lib/scheduleTableExport';
import type { Shift, Holiday } from '@/lib/types';

interface Props {
  shifts: Shift[];
  holidays: Holiday[];
  year: number;
  month: number;
}

export function ScheduleTableExportButton({ shifts, holidays, year, month }: Props) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const pharmacistShifts = shifts.filter(s => (s.user as any)?.role === 'pharmacist');
      if (!pharmacistShifts.length) {
        throw new Error('ไม่พบข้อมูลเวรเภสัชกรในเดือนนี้');
      }
      await exportScheduleTable(pharmacistShifts, holidays, year, month);
      toastSuccess('ส่งออกตารางเวรสำเร็จ');
    } catch (err: any) {
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800 disabled:opacity-50 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <span>📅</span>
      )}
      <span className="sm:hidden">ตารางเวร</span>
      <span className="hidden sm:inline">ตารางเวร Excel</span>
    </button>
  );
}
