'use client';

import { useState } from 'react';
import { X, Calendar, Users, Bell, Loader2 } from 'lucide-react';
import { ManageHolidaysModal } from './ManageHolidaysModal';
import { AdminUserManagementModal } from './AdminUserManagementModal';
import { cn } from '@/lib/utils';
import { toastSuccess, toastError } from '@/lib/swal';

type Tab = 'holidays' | 'users' | 'notifications';

interface AdminSettingsModalProps {
  onClose: () => void;
  onHolidaysChange: () => void;
}

export function AdminSettingsModal({ onClose, onHolidaysChange }: AdminSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('holidays');
  const [testReminderLoading, setTestReminderLoading] = useState<'morning' | 'evening' | null>(null);

  async function handleTestReminder(run: 'morning' | 'evening') {
    setTestReminderLoading(run);
    try {
      const res = await fetch('/api/cron/test-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toastSuccess(`ส่งแจ้งเตือน${run === 'morning' ? 'เช้า' : 'เย็น'}สำเร็จ — แจ้ง ${data.usersNotified ?? 0} คน (push ${data.sent ?? 0})`);
      } else {
        toastError(data.error || data.message || 'ไม่มีข้อมูลเวร');
      }
    } catch {
      toastError('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setTestReminderLoading(null);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'holidays', label: 'วันหยุด', icon: <Calendar className="w-4 h-4" /> },
    { id: 'users',    label: 'ผู้ใช้',   icon: <Users className="w-4 h-4" /> },
    { id: 'notifications', label: 'แจ้งเตือน', icon: <Bell className="w-4 h-4" /> },
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

          {activeTab === 'notifications' && (
            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-gray-50/50">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                  <div className="p-2 bg-sky-100 text-sky-600 rounded-xl">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">ทดสอบการแจ้งเตือน</h3>
                    <p className="text-sm text-gray-500">จำลองการส่ง push notification ให้ผู้ที่มีเวร</p>
                  </div>
                </div>

                {/* Morning run */}
                <div className="flex items-start justify-between gap-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">🕗 รอบเช้า — 08:00</p>
                    <p className="text-xs text-gray-500 mt-0.5">แจ้งเตือนเวรของ<strong>วันนี้</strong> (ยกเว้นเวรรุ่งอรุณ)</p>
                  </div>
                  <button
                    onClick={() => handleTestReminder('morning')}
                    disabled={testReminderLoading !== null}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                  >
                    {testReminderLoading === 'morning' ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>▶</span>}
                    ทดสอบ 08:00
                  </button>
                </div>

                {/* Evening run */}
                <div className="flex items-start justify-between gap-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">🕕 รอบเย็น — 18:00</p>
                    <p className="text-xs text-gray-500 mt-0.5">แจ้งเตือนเวรของ<strong>พรุ่งนี้</strong> (ทุกเวร)</p>
                  </div>
                  <button
                    onClick={() => handleTestReminder('evening')}
                    disabled={testReminderLoading !== null}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                  >
                    {testReminderLoading === 'evening' ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>▶</span>}
                    ทดสอบ 18:00
                  </button>
                </div>

                <p className="text-xs text-gray-400 text-center">
                  ส่งให้เฉพาะผู้ใช้ที่เปิดรับ push notification และมีเวรตรงตามเงื่อนไขเท่านั้น
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
