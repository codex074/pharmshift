'use client';

import { useState } from 'react';
import { Loader2, X, Lock } from 'lucide-react';
import { toastError, toastSuccess } from '@/lib/swal';
import { exportScheduleTable } from '@/lib/scheduleTableExport';
import type { Shift, Holiday } from '@/lib/types';

interface Props {
  shifts: Shift[];
  holidays: Holiday[];
  year: number;
  month: number;
  isPublished: boolean;
}

export function ScheduleTableExportButton({ shifts, holidays, year, month, isPublished }: Props) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleExport = async (useOriginal: boolean) => {
    setShowModal(false);
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

  if (!isPublished) {
    return (
      <div className="relative group">
        <button
          disabled
          className="bg-gray-100 text-gray-400 cursor-not-allowed font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="sm:hidden">ตารางเวร</span>
          <span className="hidden sm:inline">ตารางเวร Excel</span>
        </button>
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
          <div className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
            ยังไม่ได้ประกาศตารางเวรเดือนนี้
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800 disabled:opacity-50 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>📅</span>}
        <span className="sm:hidden">ตารางเวร</span>
        <span className="hidden sm:inline">ตารางเวร Excel</span>
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <h3 className="text-base font-bold text-gray-900">Export ตารางเวร Excel</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500 mb-1">เลือกประเภทข้อมูลที่ต้องการ Export</p>

              {/* ตารางปัจจุบัน */}
              <button
                onClick={() => handleExport(false)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                  👤
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">ตารางปัจจุบัน</p>
                  <p className="text-xs text-gray-400 mt-0.5">แสดง user ล่าสุด (รวมการแลก/โอนเวรแล้ว)</p>
                </div>
              </button>

              {/* ตารางเดิม */}
              <button
                onClick={() => handleExport(true)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
                  📋
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">ตารางเดิม</p>
                  <p className="text-xs text-gray-400 mt-0.5">แสดง original user ตอนที่ประกาศตาราง</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
