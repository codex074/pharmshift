'use client';

import { X, Calendar, Moon, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Shift } from '@/lib/types';
import { ShiftProvenance } from '@/components/calendar/ShiftProvenance';

interface ShiftDetailModalProps {
  shift: Shift;
  currentUserId: string;
  onClose: () => void;
}

export function ShiftDetailModal({ shift, currentUserId, onClose }: ShiftDetailModalProps) {
  const shiftDate = new Date(shift.date + 'T00:00:00');
  const deptName = (shift.department as any)?.name || shift.department_name || '';
  const displayDeptName = shift.position
    ? `${deptName} (${shift.position})`
    : deptName;

  // Shift-type colour palette (matching CalendarGrid)
  const shiftTheme =
    shift.shift_type === 'เช้า'     ? { bg: '#E8F9FA', border: '#9FDCE0', text: 'text-teal-900',   hdrIcon: <Sun  className="w-4 h-4 text-teal-600"   /> } :
    shift.shift_type === 'บ่าย'     ? { bg: '#F3EDF8', border: '#9E76B4', text: 'text-purple-900', hdrIcon: <Sun  className="w-4 h-4 text-purple-500" /> } :
    shift.shift_type === 'ดึก'      ? { bg: '#EEF0FF', border: '#99ABFF', text: 'text-indigo-900', hdrIcon: <Moon className="w-4 h-4 text-indigo-500" /> } :
    shift.shift_type === 'รุ่งอรุณ' ? { bg: '#FEF3DC', border: '#FFCA72', text: 'text-amber-900',  hdrIcon: <Moon className="w-4 h-4 text-amber-500"  /> } :
                                      { bg: '#F3EDF8', border: '#9E76B4', text: 'text-purple-900', hdrIcon: <Calendar className="w-4 h-4 text-purple-500" /> };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-slide-up sm:animate-fade-in overflow-hidden">
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header — tinted with shift colour */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ backgroundColor: shiftTheme.bg, borderColor: shiftTheme.border }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center">
              {shiftTheme.hdrIcon}
            </div>
            <div>
              <h2 className={cn('font-bold text-sm', shiftTheme.text)}>{shift.shift_type}{deptName && deptName !== shift.shift_type ? ` · ${displayDeptName}` : ''}</h2>
              <p className="text-[11px] text-gray-500">{format(shiftDate, 'EEEE d MMMM yyyy', { locale: th })}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/70 text-gray-400 hover:text-red-500 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <ShiftProvenance shift={shift} currentUserId={currentUserId} />
        </div>

      </div>
    </div>
  );
}
