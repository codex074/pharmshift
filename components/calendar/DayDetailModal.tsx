'use client';

import { format } from 'date-fns';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarDay, Shift, User, ShiftType } from '@/lib/types';
import { getSlotsForDate, DEPT_COLORS, SHIFT_CONFIG } from '@/lib/types';

interface DayDetailModalProps {
  day: CalendarDay;
  currentUser: User | null;
  onClose: () => void;
  onSwapClick: (shift: Shift) => void;
}

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export function DayDetailModal({ day, currentUser, onClose, onSwapClick }: DayDetailModalProps) {
  const dayNumber = format(day.date, 'd');
  const dayOfWeek = THAI_DAYS[day.date.getDay()];
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

  const shiftGroups = getSlotsForDate(day.date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gradient-header px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">{dayNumber}</span>
              <span className="text-white/80 text-sm font-medium">{dayOfWeek}</span>
              {isWeekend && (
                <span className="text-[10px] text-amber-300 bg-white/20 px-2 py-0.5 rounded-full font-medium">วันหยุด</span>
              )}
            </div>
            <p className="text-white/60 text-xs mt-0.5">{format(day.date, 'MMMM yyyy')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {shiftGroups.map(({ shift, slots }) => {
            const cfg = SHIFT_CONFIG[shift];
            return (
              <div key={shift} className="rounded-xl border border-gray-100 overflow-hidden">
                {/* Shift header */}
                <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: cfg.color + '10' }}>
                  <span className="text-sm">{cfg.icon}</span>
                  <span className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{cfg.time}</span>
                </div>

                {/* Slot rows */}
                <div className="divide-y divide-gray-50">
                  {slots.map((slot, i) => {
                    // Find matching shifts from data
                    const matching = day.shifts.filter(s =>
                      s.shift_type === shift &&
                      getDeptName(s) === slot.dept &&
                      (!slot.position || (s as any).position === slot.position)
                    );

                    return (
                      <div key={i} className="px-4 py-2 flex items-center gap-2">
                        {/* Dept badge */}
                        <span
                          className="flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                          style={{ backgroundColor: DEPT_COLORS[slot.dept] || '#9ca3af' }}
                        >
                          {slot.dept}
                          {slot.position ? ` ${slot.position}` : ''}
                        </span>

                        {/* Time */}
                        {slot.time !== cfg.time && (
                          <span className="text-[9px] text-gray-400 font-mono">{slot.time}</span>
                        )}

                        {/* Names or empty slots */}
                        <div className="flex-1 flex flex-wrap gap-1 justify-end">
                          {matching.length > 0 ? (
                            matching.map(s => {
                              const name = getUserName(s);
                              const isMe = currentUser && s.user_id === currentUser.id;
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => onSwapClick(s)}
                                  className={cn(
                                    'text-[11px] px-2 py-0.5 rounded-lg transition-all hover:ring-2',
                                    isMe
                                      ? 'bg-violet-100 text-violet-700 font-bold ring-1 ring-violet-300'
                                      : 'bg-gray-100 text-gray-700 hover:ring-violet-300'
                                  )}
                                >
                                  {name}{isMe ? ' ⭐' : ''}
                                </button>
                              );
                            })
                          ) : (
                            // Empty slots
                            Array.from({ length: slot.count }).map((_, ci) => (
                              <span key={ci} className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-50 text-gray-300 border border-dashed border-gray-200">
                                ว่าง
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-gray-50 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">คลิกชื่อเพื่อขอแลกเวร</p>
          <span className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-full',
            day.isToday ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'
          )}>
            {day.isToday ? 'วันนี้' : format(day.date, 'dd/MM/yyyy')}
          </span>
        </div>
      </div>
    </div>
  );
}

function getUserName(shift: Shift): string {
  return (shift as any).user_nickname || shift.user?.nickname || shift.user?.name || (shift as any).user_name || '—';
}

function getDeptName(shift: Shift): string {
  return (shift as any).department_name || shift.department?.name || '';
}
