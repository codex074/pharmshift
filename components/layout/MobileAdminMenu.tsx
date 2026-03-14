'use client';

import { useState } from 'react';
import { Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileAdminMenuProps {
  isEditMode: boolean;
  onEditMode: () => void;
  onShowConfirm: () => void;
  onDeploy: () => void;
  onUpload: () => void;
  onHolidays: () => void;
  onUserManagement: () => void;
  onCompensation: () => void;
}

export function MobileAdminMenu({
  isEditMode, onEditMode, onShowConfirm, onDeploy, onUpload, onHolidays, onUserManagement, onCompensation,
}: MobileAdminMenuProps) {
  const [open, setOpen] = useState(false);

  const actions = isEditMode
    ? [
        { icon: '✅', label: 'ยืนยันการแก้ไข', action: onShowConfirm, color: 'bg-indigo-100 text-indigo-700' },
        { icon: '❌', label: 'ยกเลิกแก้ไข', action: onEditMode, color: 'bg-gray-100 text-gray-700' },
      ]
    : [
        { icon: '✏️', label: 'โหมดแก้ไข', action: onEditMode, color: 'bg-blue-100 text-blue-700' },
        { icon: '📢', label: 'ประกาศตารางเวร', action: onDeploy, color: 'bg-green-100 text-green-700' },
        { icon: '📂', label: 'เพิ่มเวร (CSV)', action: onUpload, color: 'bg-violet-100 text-violet-700' },
        { icon: '🗓️', label: 'จัดการวันหยุด', action: onHolidays, color: 'bg-orange-100 text-orange-700' },
        { icon: '👥', label: 'จัดการผู้ใช้', action: onUserManagement, color: 'bg-teal-100 text-teal-700' },
        { icon: '💰', label: 'ค่าตอบแทน', action: onCompensation, color: 'bg-amber-100 text-amber-700' },
      ];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[45] bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      )}

      {/* Menu Items */}
      {open && (
        <div className="fixed bottom-[7.5rem] right-4 z-[46] flex flex-col items-end gap-2 animate-fade-in">
          {actions.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.action();
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg font-medium text-sm transition-all active:scale-95',
                item.color,
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed bottom-20 right-4 z-[46] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 active:scale-90',
          open
            ? 'bg-gray-700 text-white rotate-0'
            : isEditMode
              ? 'bg-indigo-600 text-white shadow-indigo-300/50'
              : 'bg-violet-600 text-white shadow-violet-300/50',
        )}
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <Wrench className="w-5 h-5" />
        )}
      </button>
    </>
  );
}
