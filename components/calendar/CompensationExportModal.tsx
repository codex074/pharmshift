'use client';

import { useState } from 'react';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import { cn, THAI_MONTHS } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toastError } from '@/lib/swal';
import { exportCompensationExcel } from '@/lib/excelExport';

interface Props {
  onClose: () => void;
  defaultMonth: number;
  defaultYear: number;
}

export function CompensationExportModal({ onClose, defaultMonth, defaultYear }: Props) {
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<number>(defaultMonth);
  const [year, setYear] = useState<number>(defaultYear);

  const currentYear = new Date().getFullYear();

  const handleExport = async () => {
    setLoading(true);
    try {
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;

      // Fetch all shifts for the given month, including the user's role and salary_number
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select(`
          *,
          department:departments(id, name),
          user:users(id, name, nickname, prefix, profile_image, role, pha_id, salary_number)
        `)
        .eq('month_year', monthYear)
        .order('date', { ascending: true });

      if (shiftsError) {
        throw new Error('ไม่สามารถดึงข้อมูลเวรจากฐานข้อมูลได้');
      }

      if (!shiftsData || shiftsData.length === 0) {
        throw new Error('ไม่พบข้อมูลเวรในเดือนและปีที่ระบุ');
      }

      // Ensure that we get all roles, and they will be sorted inside `exportCompensationExcel` 
      // (which we will update to sort by role first, then pha_id).
      await exportCompensationExcel(shiftsData as any, year, month);

      onClose(); // Close the modal upon success
    } catch (err: any) {
      console.error('Compensation Export Error:', err);
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-emerald-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export ค่าตอบแทน
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/10 text-white/90 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-gray-600">
            โปรดเลือกเดือนและปีที่ต้องการ Export ข้อมูลค่าตอบแทน
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">เดือน</label>
              <select 
                value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-sm"
              >
                {THAI_MONTHS.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">ปี</label>
              <select 
                value={year} 
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-sm"
              >
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังดึงข้อมูล...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  ส่งออกเป็น Excel
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
