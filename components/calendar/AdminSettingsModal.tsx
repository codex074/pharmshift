'use client';

import { useState } from 'react';
import { X, Calendar, Users } from 'lucide-react';
import { ManageHolidaysModal } from './ManageHolidaysModal';
import { AdminUserManagementModal } from './AdminUserManagementModal';
import { cn } from '@/lib/utils';

type Tab = 'holidays' | 'users';

interface AdminSettingsModalProps {
  onClose: () => void;
  onHolidaysChange: () => void;
}

export function AdminSettingsModal({ onClose, onHolidaysChange }: AdminSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('holidays');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'holidays', label: 'วันหยุด', icon: <Calendar className="w-4 h-4" /> },
    { id: 'users',    label: 'ผู้ใช้',   icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">⚙️ ตั้งค่าระบบ</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-gray-100 flex-shrink-0 bg-white">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all',
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/60'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {activeTab === 'holidays' && (
            <ManageHolidaysModal
              embedded
              onClose={onClose}
              onSuccess={onHolidaysChange}
            />
          )}

          {activeTab === 'users' && (
            <AdminUserManagementModal
              embedded
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
