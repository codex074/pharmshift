'use client';

import { useState } from 'react';
import { Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileAdminMenuProps {
  isEditMode: boolean;
  isSubAdmin?: boolean;
  onEditMode: () => void;
  onShowConfirm: () => void;
  onDeploy: () => void;
  onUpload: () => void;
  onSettings: () => void;
  onCompensation: () => void;
}

export function MobileAdminMenu({
  isEditMode, isSubAdmin, onEditMode, onShowConfirm, onDeploy, onUpload, onSettings, onCompensation,
}: MobileAdminMenuProps) {
  const [open, setOpen] = useState(false);

  const actions = isEditMode
    ? [
        { icon: '✅', label: 'ยืนยันการแก้ไข', action: onShowConfirm, color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
        { icon: '❌', label: 'ยกเลิกแก้ไข', action: onEditMode, color: 'bg-gray-50 text-gray-700 border-gray-100' },
      ]
    : [
        { icon: '✏️', label: 'โหมดแก้ไข', action: onEditMode, color: 'bg-blue-50 text-blue-700 border-blue-100' },
        { icon: '📢', label: 'ประกาศตารางเวร', action: onDeploy, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { icon: '📂', label: 'เพิ่มเวร', action: onUpload, color: 'bg-violet-50 text-violet-700 border-violet-100' },
        ...(!isSubAdmin ? [
          { icon: '⚙️', label: 'ตั้งค่าระบบ', action: onSettings, color: 'bg-slate-50 text-slate-700 border-slate-100' },
        ] : []),
        { icon: '💰', label: 'ค่าตอบแทน', action: onCompensation, color: 'bg-amber-50 text-amber-700 border-amber-100' },
      ];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[45] bg-black/25 backdrop-blur-[3px] transition-opacity duration-300" onClick={() => setOpen(false)} />
      )}

      {/* Menu Items */}
      {open && (
        <div className="fixed bottom-[7.5rem] right-4 z-[46] flex flex-col items-end gap-2">
          {actions.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.action();
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-lg font-semibold text-sm transition-all active:scale-95 border backdrop-blur-sm animate-slide-up-fade',
                item.color,
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed bottom-20 right-4 z-[46] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 active:scale-90',
          open
            ? 'bg-gray-700 text-white rotate-90 shadow-gray-300/50'
            : isEditMode
              ? 'text-white shadow-indigo-300/40'
              : 'text-white shadow-violet-300/40',
        )}
        style={!open ? {
          background: isEditMode
            ? 'linear-gradient(135deg, hsl(230 65% 55%), hsl(252 80% 58%))'
            : 'linear-gradient(135deg, hsl(252 80% 58%), hsl(271 81% 54%))'
        } : undefined}
      >
        {open ? (
          <X className="w-6 h-6 transition-transform duration-300" />
        ) : (
          <Wrench className="w-5 h-5 transition-transform duration-300" />
        )}
      </button>
    </>
  );
}
