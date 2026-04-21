'use client';

import { useState } from 'react';
import { X, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { THAI_MONTHS } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toastError, toastSuccess } from '@/lib/swal';
import { exportCompensationExcel, exportEvidenceExcel } from '@/lib/excelExport';
import { exportSignSheet } from '@/lib/signSheetExport';
import { cn } from '@/lib/utils';

type ExportType = 'compensation' | 'sign-sheet' | 'evidence';
type UserRole = 'pharmacist' | 'pharmacy_technician' | 'officer';

const ROLES: { id: UserRole; label: string; short: string; color: string }[] = [
  { id: 'pharmacist',          label: 'เภสัชกร',                  short: 'ภก.',   color: 'bg-violet-100 border-violet-400 text-violet-800' },
  { id: 'pharmacy_technician', label: 'เจ้าพนักงานเภสัชกรรม',    short: 'จพ.',   color: 'bg-sky-100 border-sky-400 text-sky-800' },
  { id: 'officer',             label: 'เจ้าหน้าที่',              short: 'จนท.',  color: 'bg-amber-100 border-amber-400 text-amber-800' },
];

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

interface Props {
  onClose: () => void;
  defaultMonth: number;
  defaultYear: number;
}

export function AdminExportModal({ onClose, defaultMonth, defaultYear }: Props) {
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [selected, setSelected] = useState<ExportType>('compensation');
  const [selectedRoles, setSelectedRoles] = useState<Set<UserRole>>(
    new Set<UserRole>(['pharmacist', 'pharmacy_technician', 'officer'])
  );

  const currentYear = new Date().getFullYear();
  const hasRoleFilter = selected === 'compensation' || selected === 'evidence' || selected === 'sign-sheet';

  function toggleRole(role: UserRole) {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  }

  const handleExport = async () => {
    if (hasRoleFilter && selectedRoles.size === 0) {
      toastError('กรุณาเลือก Role อย่างน้อย 1 อย่าง');
      return;
    }
    setLoading(true);
    try {
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;

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

      // กรอง role ตามที่เลือก
      const filteredShifts = hasRoleFilter
        ? shiftsData.filter((s: any) => selectedRoles.has(s.user?.role))
        : shiftsData;

      if (hasRoleFilter && !filteredShifts.length) {
        throw new Error('ไม่พบข้อมูลเวรของ Role ที่เลือกในเดือนนี้');
      }

      if (selected === 'compensation') {
        await exportCompensationExcel(filteredShifts as any, year, month);
      } else {
        const userIds = new Set<string>();
        filteredShifts.forEach((s: any) => {
          if (s.user_id) userIds.add(s.user_id);
          if (s.original_user_id) userIds.add(s.original_user_id);
        });

        const { data: usersData } = await supabase
          .from('users')
          .select('id, f_name, l_name, prefix, role, pha_id, salary_number, nickname')
          .in('id', Array.from(userIds));

        if (selected === 'sign-sheet') {
          // ดึงเวรดึกวันสุดท้ายของเดือนก่อนหน้า
          // เพื่อให้แสดงในวันที่ 1 ของเดือนปัจจุบัน (ดึก advance date +1 วัน)
          const prevMonth = month === 1 ? 12 : month - 1;
          const prevYear = month === 1 ? year - 1 : year;
          const lastDayOfPrevMonth = new Date(year, month - 1, 0).getDate();
          const lastDayStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

          const { data: prevDukData } = await supabase
            .from('shifts')
            .select(`
              id, date, shift_type, position, user_id, original_user_id, month_year,
              department:departments(id, name),
              user:users!original_user_id(id, f_name, l_name, nickname, prefix, role, pha_id, salary_number)
            `)
            .eq('date', lastDayStr)
            .eq('shift_type', 'ดึก');

          const prevDukShifts = (prevDukData || []) as any[];
          const allSignSheetShifts = [...(filteredShifts as any[]), ...prevDukShifts];

          // รวม userIds จากเวรเดือนก่อนด้วย
          prevDukShifts.forEach((s: any) => {
            if (s.user_id) userIds.add(s.user_id);
            if (s.original_user_id) userIds.add(s.original_user_id);
          });

          const { data: allUsersData } = await supabase
            .from('users')
            .select('id, f_name, l_name, prefix, role, pha_id, salary_number, nickname')
            .in('id', Array.from(userIds));

          await exportSignSheet(allSignSheetShifts, allUsersData || [], year, month);
        } else {
          await exportEvidenceExcel(filteredShifts as any, usersData || [], year, month);
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

          {/* Role checkboxes — แสดงเฉพาะ compensation / evidence */}
          {hasRoleFilter && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">เลือก Role</label>
                <button
                  onClick={() =>
                    selectedRoles.size === ROLES.length
                      ? setSelectedRoles(new Set<UserRole>())
                      : setSelectedRoles(new Set<UserRole>(ROLES.map(r => r.id)))
                  }
                  className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                >
                  {selectedRoles.size === ROLES.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {ROLES.map((r) => {
                  const checked = selectedRoles.has(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRole(r.id)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-all',
                        checked
                          ? r.color + ' shadow-sm'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      )}
                    >
                      {/* Custom checkbox */}
                      <div className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all',
                        checked ? 'bg-current border-current' : 'border-gray-300 bg-white'
                      )}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-semibold">{r.label}</span>
                    </button>
                  );
                })}
              </div>
              {selectedRoles.size === 0 && (
                <p className="text-xs text-red-500 font-medium">กรุณาเลือก Role อย่างน้อย 1 อย่าง</p>
              )}
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={loading || (hasRoleFilter && selectedRoles.size === 0)}
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
