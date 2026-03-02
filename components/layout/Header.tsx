'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Bell, LogOut, ChevronLeft, ChevronRight, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import type { User as UserType } from '@/lib/types';
import { formatThaiMonth } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { UserProfileModal } from '@/components/UserProfileModal';

interface HeaderProps {
  currentUser: UserType | null;
  pendingCount: number;
  onBellClick: () => void;
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
}

export function Header({
  currentUser, pendingCount, onBellClick, year, month, onMonthChange, viewMode, onViewModeChange,
}: HeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    toast.info('ออกจากระบบแล้ว');
    router.push('/login');
  }

  function prevMonth() {
    const d = new Date(year, month - 2);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  }

  function nextMonth() {
    const d = new Date(year, month);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  }

  const displayName = currentUser?.fullname
    ? currentUser.fullname
    : currentUser?.prefix
      ? `${currentUser.prefix}${currentUser.name}`
      : currentUser?.name || '';

  return (
    <>
      <header className="sticky top-0 z-40 glass-card border-b border-white/50 shadow-sm">
        {/* ── Row 1: Logo · User · Icons ─────────────────────────────── */}
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl gradient-header flex items-center justify-center shadow-md">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg leading-none hidden xs:block sm:block">เวรดี๊ดี</span>
          </div>

          {/* Month Navigator — visible on md+ in row 1, hidden on mobile (shown in row 2) */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 min-w-[36px] min-h-[36px] rounded-lg hover:bg-gray-100 text-gray-500 transition-all flex items-center justify-center"
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-semibold text-gray-800 w-36 text-center">
              {formatThaiMonth(year, month)}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 min-w-[36px] min-h-[36px] rounded-lg hover:bg-gray-100 text-gray-500 transition-all flex items-center justify-center"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode Toggle — visible on md+ in row 1 */}
          <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => onViewModeChange('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                viewMode === 'all'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              ทุกเวร
            </button>
            <button
              onClick={() => onViewModeChange('mine')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                viewMode === 'mine'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <User className="w-3.5 h-3.5" />
              เวรของฉัน
            </button>
          </div>

          {/* Right section – always visible */}
          <div className="flex items-center gap-1.5 ml-auto md:ml-0">
            {/* Notification bell */}
            <button
              onClick={onBellClick}
              id="notifications-button"
              className="relative p-2 min-w-[40px] min-h-[40px] rounded-xl hover:bg-gray-100 text-gray-500 transition-all flex items-center justify-center"
            >
              <Bell className="w-5 h-5" />
              {pendingCount > 0 && (
                <>
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full notification-ping" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                </>
              )}
            </button>

            {/* User info (now clickable) */}
            {currentUser && (
              <button
                onClick={() => setIsProfileModalOpen(true)}
                title="แก้ไขข้อมูลส่วนตัว"
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 min-h-[40px] bg-violet-50 hover:bg-violet-100 transition-colors rounded-xl border border-violet-100 shadow-sm"
              >
                <div className="w-7 h-7 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shadow-inner border border-violet-400">
                  {currentUser.profile_image === 'female' ? '♀' : '♂'}
                </div>
                {/* Name: only on sm+ */}
                <span className="hidden sm:block text-sm font-bold text-violet-800 max-w-28 lg:max-w-40 truncate leading-tight py-0.5">
                  {displayName}
                </span>
              </button>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              id="logout-button"
              className="p-2 min-w-[40px] min-h-[40px] rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center"
              title="ออกจากระบบ"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Row 2 (mobile only): Month navigator + View toggle ─────── */}
        <div className="md:hidden border-t border-gray-100 bg-white/70 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2 gap-3">
            {/* Month Navigator */}
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="p-2 min-w-[40px] min-h-[40px] rounded-lg hover:bg-gray-100 text-gray-500 transition-all flex items-center justify-center"
                aria-label="เดือนก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-semibold text-gray-800 text-center min-w-[7rem]">
                {formatThaiMonth(year, month)}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 min-w-[40px] min-h-[40px] rounded-lg hover:bg-gray-100 text-gray-500 transition-all flex items-center justify-center"
                aria-label="เดือนถัดไป"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => onViewModeChange('all')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  viewMode === 'all'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-gray-500'
                )}
              >
                <Users className="w-3.5 h-3.5" />
                ทุกเวร
              </button>
              <button
                onClick={() => onViewModeChange('mine')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  viewMode === 'mine'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-gray-500'
                )}
              >
                <User className="w-3.5 h-3.5" />
                เวรของฉัน
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Modals */}
      {isProfileModalOpen && currentUser && (
        <UserProfileModal
          currentUser={currentUser}
          onClose={() => setIsProfileModalOpen(false)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </>
  );
}
