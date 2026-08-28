'use client';

import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarDays, X } from 'lucide-react';
import type { Shift, ShiftType } from '@/lib/types';
import { deptDisplayLabel, positionDisplayLabel, deptDisplayLabelForRole, positionDisplayLabelForRole, isPharmTechMergedIpdDept } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PersonalShiftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shifts: Shift[];
  filterType: ShiftType | 'all';
  month: number;
  year: number;
}

const TYPE_COLORS: Record<string, string> = {
  'เช้า': 'bg-amber-100/50 text-amber-700 border-amber-200',
  'บ่าย': 'bg-cyan-100/50 text-cyan-700 border-cyan-200',
  'ดึก': 'bg-indigo-100/50 text-indigo-700 border-indigo-200',
  'รุ่งอรุณ': 'bg-orange-100/50 text-orange-700 border-orange-200',
  'all': 'bg-gray-100/50 text-gray-700 border-gray-200',
};

const TYPE_LABELS: Record<string, string> = {
  'เช้า': 'เวรเช้า',
  'บ่าย': 'เวรบ่าย',
  'ดึก': 'เวรดึก',
  'รุ่งอรุณ': 'เวรรุ่งอรุณ',
  'all': 'ทั้งหมด',
};

export function PersonalShiftsModal({
  isOpen,
  onClose,
  shifts,
  filterType,
  month,
  year,
}: PersonalShiftsModalProps) {
  if (!isOpen) return null;

  // Local helper to get department name from shift position
  const getDeptName = (s: Shift): string => {
    const dept = s.department?.name || (s as any).department_name;
    if (dept) return dept;
    
    if (!s.position) return 'ไม่ระบุ';
    if (s.position.includes('โครงการ')) return 'โครงการ';
    if (s.position.includes('Surg')) return 'Surg';
    if (s.position.includes('MED')) return 'MED';
    if (s.position.includes('ER')) return 'ER';
    if (s.position.includes('SMC')) return 'SMC';
    if (s.position.includes('ส่งยา สอ.')) return 'ส่งยา สอ.';
    if (s.position.includes('OPD') || s.position.includes('IPD') || s.position.includes('HIV') || s.position.includes('รุ่งอรุณ')) return 'รุ่งอรุณ';
    return s.position;
  };

  // Filter and sort shifts
  const sortedShifts = [...shifts]
    .filter(s => filterType === 'all' || s.shift_type === filterType)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const monthName = format(new Date(year, month - 1), 'MMMM yyyy', { locale: th });
  const themeColor = TYPE_COLORS[filterType as string] || TYPE_COLORS['all'];
  const titleStr = filterType === 'all' ? 'เวรทั้งหมดของฉัน' : `รายละเอียดเวรของฉัน (${TYPE_LABELS[filterType as string]})`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 pb-0 bg-gray-900/40 backdrop-blur-sm sm:transition-opacity">
      {/* Background overlay for click-to-close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh] sm:max-h-[80vh] min-h-[50vh] animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        
        {/* Mobile drag indicator */}
        <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-200 rounded-full z-10" />

        {/* Header */}
        <div className={cn("px-5 pt-8 pb-5 sm:py-5 border-b border-gray-100 flex items-center justify-between", themeColor.split(' ')[0])}>
          <div>
            <h2 className={cn("text-lg font-bold line-clamp-1", themeColor.includes('text-') ? themeColor.split(' ').find(c => c.startsWith('text-')) : 'text-gray-900')}>
              {titleStr}
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-0.5">เดือน {monthName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 bg-white/50 hover:bg-white/80 rounded-full text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - Shift List */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50/50">
          {sortedShifts.length > 0 ? (
            <div className="space-y-3">
              {sortedShifts.map((shift) => {
                const shiftDate = new Date(shift.date);
                const dayName = format(shiftDate, 'EEEE', { locale: th });
                const fullDate = format(shiftDate, 'd MMMM yyyy', { locale: th });
                const isWeekend = shiftDate.getDay() === 0 || shiftDate.getDay() === 6;
                const dateColor = isWeekend ? 'text-red-600' : 'text-indigo-600';
                
                return (
                  <div key={shift.id} className="bg-white border text-left border-gray-200/60 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow flex items-start sm:items-center gap-4">
                    
                    {/* Date Block */}
                    <div className={cn("rounded-lg bg-gray-50 px-3 py-2 text-center min-w-[4.5rem]", dateColor)}>
                      <div className="text-xs font-semibold opacity-80 uppercase">{dayName.slice(0, 3)}</div>
                      <div className="text-xl leading-none font-bold mt-0.5">{format(shiftDate, 'd')}</div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 py-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", TYPE_COLORS[shift.shift_type])}>
                          {shift.shift_type}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {getDeptName(shift) !== 'ไม่ระบุ' ? (
                            shift.shift_type === 'เช้า' && isPharmTechMergedIpdDept((shift as any).user?.role, getDeptName(shift)) && shift.position
                              ? `IPD (${positionDisplayLabelForRole((shift as any).user?.role, getDeptName(shift), shift.position)})`
                              : shift.shift_type === 'เช้า' && getDeptName(shift) === 'MED' && shift.position
                              ? `${deptDisplayLabel(getDeptName(shift))} (${positionDisplayLabel(shift.position)})`
                              : deptDisplayLabel(getDeptName(shift))
                          ) : ''}
                        </span>
                      </div>
                      <p className="text-[13px] text-gray-500 flex items-center gap-1.5 mt-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {fullDate}
                      </p>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-60">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CalendarDays className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">ไม่มีเวรในหมวดหมู่นี้</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
