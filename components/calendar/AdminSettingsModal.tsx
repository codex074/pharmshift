'use client';

import { useState } from 'react';
import { X, Calendar, Users, Database, TableProperties, Activity, Coins } from 'lucide-react';
import { ManageHolidaysModal } from './ManageHolidaysModal';
import { AdminUserManagementModal } from './AdminUserManagementModal';
import { AdminBackupModal } from './AdminBackupModal';
import { AdminShiftEditorModal } from './AdminShiftEditorModal';
import { AdminAuditLogModal } from './AdminAuditLogModal';
import { AdminCompensationSettingsModal } from './AdminCompensationSettingsModal';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

type Tab = 'holidays' | 'users' | 'shifts' | 'backup' | 'compensation' | 'audit';

interface AdminSettingsModalProps {
  onClose: () => void;
  onHolidaysChange: () => void;
  currentUser: User | null;
}

export function AdminSettingsModal({ onClose, onHolidaysChange, currentUser }: AdminSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('holidays');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'holidays', label: 'วันหยุด',   icon: <Calendar        className="w-4 h-4" /> },
    { id: 'users',    label: 'ผู้ใช้',     icon: <Users           className="w-4 h-4" /> },
    { id: 'shifts',   label: 'แก้ไขเวร',  icon: <TableProperties className="w-4 h-4" /> },
    { id: 'backup',   label: 'ข้อมูล',    icon: <Database        className="w-4 h-4" /> },
    ...(currentUser?.role === 'admin'
      ? [
          { id: 'compensation' as Tab, label: 'ค่าตอบแทน', icon: <Coins className="w-4 h-4" /> },
          { id: 'audit' as Tab, label: 'Audit', icon: <Activity className="w-4 h-4" /> },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-lg shrink-0">⚙️</div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">ตั้งค่าระบบ</h2>
              <p className="text-xs text-gray-400 truncate">จัดการวันหยุด ผู้ใช้ เวร และข้อมูลระบบ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs — scrollable pill bar */}
        <div className="px-3 sm:px-4 py-2.5 border-b border-gray-100 flex-shrink-0 bg-gray-50/60 overflow-x-auto">
          <div className="flex gap-1.5 w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl transition-all active:scale-95',
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-white'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-gray-50/40">
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

          {activeTab === 'shifts' && (
            <AdminShiftEditorModal />
          )}

          {activeTab === 'backup' && (
            <AdminBackupModal currentUser={currentUser} />
          )}

          {activeTab === 'compensation' && currentUser?.role === 'admin' && (
            <AdminCompensationSettingsModal />
          )}

          {activeTab === 'audit' && currentUser?.role === 'admin' && (
            <AdminAuditLogModal />
          )}
        </div>
      </div>
    </div>
  );
}
