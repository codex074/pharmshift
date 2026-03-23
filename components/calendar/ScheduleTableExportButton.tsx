'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (useOriginal: boolean) => {
    setOpen(false);
    setLoading(true);
    try {
      const pharmacistShifts = shifts.filter(s => (s.user as any)?.role === 'pharmacist');
      if (!pharmacistShifts.length) throw new Error('ไม่พบข้อมูลเวรเภสัชกรในเดือนนี้');
      await exportScheduleTable(pharmacistShifts, holidays, year, month, useOriginal);
      toastSuccess(useOriginal ? 'ส่งออกตารางเวร (ตารางเดิม) สำเร็จ' : 'ส่งออกตารางเวรสำเร็จ');
    } catch (err: any) {
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      {/* Main button + chevron */}
      <div className="flex items-stretch rounded-xl overflow-hidden shadow-sm border border-green-200">
        {/* Left: export ปัจจุบัน (default) */}
        <button
          onClick={() => handleExport(false)}
          disabled={loading}
          className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800 disabled:opacity-50 font-medium px-3 sm:px-4 py-2 text-xs sm:text-sm transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>📅</span>}
          <span className="sm:hidden">ตารางเวร</span>
          <span className="hidden sm:inline">ตารางเวร Excel</span>
        </button>

        {/* Divider */}
        <div className="w-px bg-green-200" />

        {/* Right: chevron dropdown */}
        <button
          onClick={() => setOpen(v => !v)}
          disabled={loading}
          className="bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-800 disabled:opacity-50 px-1.5 transition-colors flex items-center"
          aria-label="เพิ่มเติม"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[200px]">
          <button
            onClick={() => handleExport(false)}
            className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2.5"
          >
            <span className="text-base">👤</span>
            <div>
              <p className="font-semibold text-gray-800">ตารางปัจจุบัน</p>
              <p className="text-xs text-gray-400">user ล่าสุด (หลัง swap)</p>
            </div>
          </button>
          <div className="h-px bg-gray-100" />
          <button
            onClick={() => handleExport(true)}
            className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2.5"
          >
            <span className="text-base">📋</span>
            <div>
              <p className="font-semibold text-gray-800">ตารางเดิม</p>
              <p className="text-xs text-gray-400">original user (ตอนประกาศ)</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
