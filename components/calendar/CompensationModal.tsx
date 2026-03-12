'use client';

import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { X, Coins } from 'lucide-react';
import type { Shift, User } from '@/lib/types';
import { cn } from '@/lib/utils';

// Ported compensation rules from excelExport.ts
function getDeptName(s: Shift) {
  return s.department?.name || s.department_name || '';
}

const COMPENSATION_RULES = [
  {
    name: 'เวรรุ่งอรุณ',
    rateLabel: 'อัตรา/ชม.',
    unitLabel: 'ชั่วโมง',
    getRate: (role: string) => role === 'officer' ? 56.25 : role === 'pharmacy_technician' ? 90 : 135,
    filter: (s: Shift) => s.shift_type === 'รุ่งอรุณ',
    getValue: () => 1.5,
    color: 'bg-orange-50 text-orange-700 border-orange-100',
  },
  {
    name: 'เวรโครงการพิเศษ',
    rateLabel: 'อัตรา/ชม.',
    unitLabel: 'ชั่วโมง',
    getRate: (role: string) => role === 'officer' ? 56.25 : role === 'pharmacy_technician' ? 90 : 135,
    filter: (s: Shift) => getDeptName(s) === 'โครงการ',
    getValue: () => 4,
    color: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  {
    name: 'เช้า-บ่าย-ดึก',
    rateLabel: 'อัตรา/เวร',
    unitLabel: 'เวร',
    getRate: (role: string) => role === 'officer' ? 330 : role === 'pharmacy_technician' ? 520 : 780,
    filter: (s: Shift) => ['เช้า', 'บ่าย', 'ดึก'].includes(s.shift_type) && !['โครงการ', 'SMC', 'Chemo'].includes(getDeptName(s)),
    getValue: () => 1,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  {
    name: 'พิเศษ SMC',
    rateLabel: 'อัตรา/เวร',
    unitLabel: 'เวร',
    getRate: (role: string) => role === 'officer' ? 375 : role === 'pharmacy_technician' ? 600 : 900,
    filter: (s: Shift) => getDeptName(s) === 'SMC',
    getValue: () => 1,
    color: 'bg-pink-50 text-pink-700 border-pink-100',
  },
  {
    name: 'งานเคมีบำบัด (Chemo)',
    rateLabel: 'อัตรา/เวร',
    unitLabel: 'เวร',
    getRate: () => 390,
    filter: (s: Shift) => getDeptName(s) === 'Chemo',
    getValue: () => 1,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
];

interface CompensationModalProps {
  isOpen: boolean;
  onClose: () => void;
  shifts: Shift[];
  currentUser: User | null;
  month: number;
  year: number;
}

export function CompensationModal({
  isOpen,
  onClose,
  shifts,
  currentUser,
  month,
  year,
}: CompensationModalProps) {
  if (!isOpen || !currentUser) return null;

  const monthName = format(new Date(year, month - 1), 'MMMM yyyy', { locale: th });
  const role = currentUser.role || 'pharmacist';

  // Calculate breakdown
  let grandTotalValue = 0;
  let grandTotalAmount = 0;

  const breakdown = COMPENSATION_RULES.map(rule => {
    const relevantShifts = shifts.filter(rule.filter);
    
    // Sum units
    const totalUnits = relevantShifts.reduce((acc, curr) => acc + rule.getValue(), 0);
    const rate = rule.getRate(role);
    const totalAmount = totalUnits * rate;

    grandTotalValue += totalUnits;
    grandTotalAmount += totalAmount;

    return {
      ...rule,
      totalUnits,
      rate,
      totalAmount,
    };
  }).filter(b => b.totalUnits > 0);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 pb-0 bg-gray-900/40 backdrop-blur-sm sm:transition-opacity">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh] sm:max-h-[90vh] min-h-[50vh] animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        
        {/* Mobile drag indicator */}
        <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-200 rounded-full z-10" />

        <div className="px-5 pt-8 pb-5 sm:py-5 border-b border-gray-100 flex items-center justify-between bg-amber-500 text-white">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-100" />
            <div>
              <h2 className="text-lg font-bold">สรุปค่าตอบแทนเวร</h2>
              <p className="text-sm font-medium text-amber-100">เดือน {monthName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-5 space-y-4">
          
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200/60 mb-6 text-center">
             <p className="text-sm text-gray-500 font-medium mb-1">ยอดรวมค่าตอบแทนสุทธิ (ประเมิน)</p>
             <p className="text-3xl font-bold text-amber-600">
                {grandTotalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                <span className="text-lg text-gray-400 font-normal ml-1">฿</span>
             </p>
          </div>

          {breakdown.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">รายละเอียดแยกตามประเภทเวร</h3>
              {breakdown.map((item, idx) => (
                <div key={idx} className={cn("rounded-xl p-4 border flex flex-col gap-2", item.color)}>
                  <div className="flex items-center justify-between font-bold text-base">
                    <span>{item.name}</span>
                    <span>{item.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-1 text-sm font-medium opacity-80 border-t border-black/5 pt-2">
                    <div className="flex justify-between">
                      <span>จำนวน:</span>
                      <span>{item.totalUnits} {item.unitLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{item.rateLabel}:</span>
                      <span>{item.rate} ฿</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <Coins className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">ไม่มีรายการเวรที่ได้ค่าตอบแทน<br/>ในเดือนนี้</p>
            </div>
          )}

          <p className="text-xs text-center text-gray-400 mt-6 pb-2">
            หมายเหตุ: ตัวเลขนี้เป็นการคำนวณเบื้องต้นจากข้อมูลปฏิทิน<br/>จำนวนเงินจริงอาจขึ้นอยู่กับระเบียบการเบิกจ่ายของโรงพยาบาล
          </p>

        </div>
      </div>
    </div>
  );
}
