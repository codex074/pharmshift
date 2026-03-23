'use client';

import { useState } from 'react';
import { X, Download, Loader2, FileSpreadsheet, ClipboardList } from 'lucide-react';
import { THAI_MONTHS } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toastError, toastSuccess } from '@/lib/swal';
import { exportCompensationExcel, exportEvidenceExcel } from '@/lib/excelExport';
import { exportSignSheet } from '@/lib/signSheetExport';

type ExportType = 'compensation' | 'sign-sheet' | 'evidence';

interface Props {
  onClose: () => void;
  defaultMonth: number;
  defaultYear: number;
}

const EXPORT_TYPES: { id: ExportType; label: string; desc: string; icon: string; color: string }[] = [
  {
    id: 'compensation',
    label: 'หลักฐานค่าตอบแทน',
    desc: 'ใช้ชื่อปัจจุบัน (หลังแลกเวร)',
    icon: '💰',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  },
  {
    id: 'sign-sheet',
    label: 'ตารางเซนต์เวร',
    desc: 'ใช้ชื่อเดิม (ก่อนแลกเวร) — 7 sheet แยกห้อง',
    icon: '✍️',
    color: 'bg-blue-50 border-blue-300 text-blue-800',
  },
  {
    id: 'evidence',
    label: 'หลักฐานการจัดตารางเวร',
    desc: 'ใช้ชื่อเดิม (ก่อนแลกเวร) — รูปแบบค่าตอบแทน',
    icon: '📋',
    color: 'bg-violet-50 border-violet-300 text-violet-800',
  },
];

export function AdminExportModal({ onClose, defaultMonth, defaultYear }: Props) {
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [selected, setSelected] = useState<ExportType>('compensation');

  const currentYear = new Date().getFullYear();

  const handleExport = async () => {
    setLoading(true);
    try {
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;

      // Fetch shifts
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select(`
          id, date, shift_type, position, user_id, original_user_id, month_year,
          department:departments(id, name),
          user:users!user_id(id, f_name, l_name, nickname, prefix, role, pha_id, salary_number)
        `)
        .eq('month_year', monthYear)
        .order('date', { ascending: true });

      if (shiftsError) throw new Error('ไม่สามารถดึงข้อมูลเวรได้');
      if (!shiftsData?.length) throw new Error('ไม่พบข้อมูลเวรในเดือนที่ระบุ');

      if (selected === 'compensation') {
        await exportCompensationExcel(shiftsData as any, year, month);
      } else {
        // Collect all user IDs (current + original) for lookup
        const userIds = new Set<string>();
        shiftsData.forEach((s: any) => {
          if (s.user_id) userIds.add(s.user_id);
          if (s.original_user_id) userIds.add(s.original_user_id);
        });

        const { data: usersData } = await supabase
          .from('users')
          .select('id, f_name, l_name, prefix, role, pha_id, salary_number, nickname')
          .in('id', Array.from(userIds));

        if (selected === 'sign-sheet') {
          await exportSignSheet(shiftsData as any, usersData || [], year, month);
        } else {
          await exportEvidenceExcel(shiftsData as any, usersData || [], year, month);
        }
      }

      toastSuccess('ส่งออกสำเร็จ');
      onClose();
    } catch (err: any) {
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Export ข้อมูลเวร (Admin)
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/10 text-white/90 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Month/Year selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">เดือน</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-sm"
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
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-sm"
              >
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Export type selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">ประเภทเอกสาร</label>
            {EXPORT_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  selected === t.id
                    ? t.color + ' border-current shadow-sm'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl mt-0.5">{t.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{t.label}</p>
                  <p className="text-xs opacity-75 mt-0.5">{t.desc}</p>
                </div>
                {selected === t.id && (
                  <span className="ml-auto mt-0.5 text-xs font-bold opacity-80">✓</span>
                )}
              </button>
            ))}
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังสร้างไฟล์...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                ส่งออก Excel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
