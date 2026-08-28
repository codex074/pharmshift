'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { X, Coins, ChevronDown, ChevronUp } from 'lucide-react';
import type { Shift, User } from '@/lib/types';
import { deptDisplayLabel, positionDisplayLabel, isPharmTechMergedIpdDept, positionDisplayLabelForRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  COMPENSATION_CATEGORIES,
  getCompensationShiftDate,
  getCompensationRate,
  isCompensationShiftInMonth,
  normalizeCompensationRates,
  type CompensationRatesMap,
} from '@/lib/compensation';

function getDeptName(s: Shift) {
  return s.department?.name || s.department_name || '';
}

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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [rates, setRates] = useState<CompensationRatesMap>(() => normalizeCompensationRates());
  const [rateLoadError, setRateLoadError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setRateLoadError(false);

    fetch('/api/admin/compensation-rates')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to fetch compensation rates');
        if (!cancelled) setRates(normalizeCompensationRates(data.rates));
      })
      .catch(() => {
        if (!cancelled) {
          setRates(normalizeCompensationRates());
          setRateLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen || !currentUser) return null;

  const monthName = format(new Date(year, month - 1), 'MMMM yyyy', { locale: th });
  const role = currentUser.role || 'pharmacist';
  const compensationShifts = shifts.filter((shift) =>
    isCompensationShiftInMonth(shift, year, month)
  );

  // Calculate breakdown
  let grandTotalValue = 0;
  let grandTotalAmount = 0;

  const breakdown = COMPENSATION_CATEGORIES.map(rule => {
    const relevantShifts = compensationShifts.filter(rule.filter);
    
    // Sum units
    const totalUnits = relevantShifts.reduce((acc) => acc + rule.unitValue, 0);
    const rate = getCompensationRate(rates, rule.key, role);
    const totalAmount = totalUnits * rate;

    grandTotalValue += totalUnits;
    grandTotalAmount += totalAmount;

    return {
      ...rule,
      totalUnits,
      rate,
      totalAmount,
      relevantShifts,
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
             <p className="text-sm text-gray-500 font-medium mb-1">ค่าตอบแทนที่จะได้รับตาม Excel</p>
             <p className="text-3xl font-bold text-amber-600">
                {grandTotalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                <span className="text-lg text-gray-400 font-normal ml-1">฿</span>
             </p>
          </div>

          {breakdown.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">รายละเอียดแยกตามประเภทเวร</h3>
              {breakdown.map((item, idx) => {
                const isExpanded = expandedIndex === idx;
                return (
                  <div 
                    key={idx} 
                    className={cn("rounded-xl p-4 border flex flex-col gap-2 cursor-pointer transition-all hover:brightness-95", item.color, isExpanded ? "shadow-md scale-[1.02]" : "")}
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  >
                    <div className="flex items-center justify-between font-bold text-base">
                      <span>{item.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span>{item.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
                        {isExpanded ? <ChevronUp className="w-5 h-5 opacity-60" /> : <ChevronDown className="w-5 h-5 opacity-60" />}
                      </div>
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

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-black/10 text-sm space-y-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                        <p className="font-bold opacity-80 mb-2">รายละเอียดเวร (คลิกเพื่อย่อ):</p>
                        {[...item.relevantShifts].sort((a,b) => getCompensationShiftDate(a).getTime() - getCompensationShiftDate(b).getTime()).map((s, i) => {
                          const compensationDate = getCompensationShiftDate(s);
                          return (
                          <div key={i} className="flex justify-between items-center py-1.5 px-3 bg-white/40 rounded-lg">
                            <span>
                              <span className="font-semibold">{format(compensationDate, 'dd')}</span> {format(compensationDate, 'MMM', { locale: th })} {s.shift_type} {getDeptName(s) ? (
                                s.shift_type === 'เช้า' && isPharmTechMergedIpdDept(role, getDeptName(s)) && s.position
                                  ? `(IPD ${positionDisplayLabelForRole(role, getDeptName(s), s.position)})`
                                  : s.shift_type === 'เช้า' && getDeptName(s) === 'MED' && s.position
                                  ? `(${deptDisplayLabel(getDeptName(s))} ${positionDisplayLabel(s.position)})`
                                  : `(${deptDisplayLabel(getDeptName(s))})`
                              ) : ''}
                            </span>
                            <span className="font-semibold opacity-80">+{item.unitValue}</span>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
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
            หมายเหตุ: คำนวณด้วยหลักเกณฑ์เดียวกับ Excel ค่าตอบแทน<br/>เวรดึกนับเป็นวันที่ออกเวร (วันถัดไป)
            {rateLoadError && <><br/>โหลดอัตราจาก Admin ไม่สำเร็จ จึงใช้ค่าเริ่มต้นของระบบ</>}
          </p>

        </div>
      </div>
    </div>
  );
}
