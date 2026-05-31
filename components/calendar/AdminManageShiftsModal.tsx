'use client';

import { X, ChevronRight } from 'lucide-react';

interface AdminManageShiftsModalProps {
  onClose: () => void;
  onEditMode: () => void;
  onUpload: () => void;
}

export function AdminManageShiftsModal({ onClose, onEditMode, onUpload }: AdminManageShiftsModalProps) {
  const options = [
    {
      icon: '✏️',
      title: 'โหมดแก้ไข',
      desc: 'แก้ไข / เพิ่ม / ลบเวร ในปฏิทินโดยตรง',
      action: onEditMode,
      accent: 'hover:border-blue-300 hover:bg-blue-50/60',
      iconBg: 'bg-blue-100',
    },
    {
      icon: '📂',
      title: 'เพิ่มเวร',
      desc: 'อัปโหลดตารางเวรจากไฟล์ Excel / CSV',
      action: onUpload,
      accent: 'hover:border-violet-300 hover:bg-violet-50/60',
      iconBg: 'bg-violet-100',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-slide-up sm:animate-fade-in overflow-hidden">
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-base">🛠️</span>
            </div>
            <h2 className="font-bold text-gray-900">จัดการเวร</h2>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Choices */}
        <div className="p-4 space-y-2.5">
          {options.map((opt) => (
            <button
              key={opt.title}
              onClick={() => { opt.action(); onClose(); }}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-white transition-all active:scale-[0.98] text-left ${opt.accent}`}
            >
              <div className={`w-10 h-10 rounded-xl ${opt.iconBg} flex items-center justify-center shrink-0`}>
                <span className="text-lg">{opt.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{opt.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
