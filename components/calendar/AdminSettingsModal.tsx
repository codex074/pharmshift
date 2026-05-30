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
        className={cn(
          'bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200',
          activeTab === 'shifts' || activeTab === 'audit' || activeTab === 'compensation' ? 'max-w-4xl' : 'max-w-2xl',
        )}
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
        <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-gray-100 flex-shrink-0 bg-white overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all',
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
