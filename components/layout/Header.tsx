'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, ChevronLeft, ChevronRight, Users, User, HelpCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { User as UserType } from '@/lib/types';
import { userFullName } from '@/lib/types';
import { formatThaiMonth } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { UserProfileModal } from '@/components/UserProfileModal';
import { HelpGuideModal } from '@/components/HelpGuideModal';

interface HeaderProps {
  currentUser: UserType | null;
  pendingCount: number;
  onBellClick: () => void;
  onRefresh?: () => Promise<void>;
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
}

export function Header({
  currentUser, pendingCount, onBellClick, onRefresh, year, month, onMonthChange, viewMode, onViewModeChange,
}: HeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

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

  const displayName = userFullName(currentUser);

  return (
    <>
      <header className="sticky top-0 z-40 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #0f0a2e 0%, #1a1145 40%, #2d1b69 100%)' }}
      >
        {/* ── Row 1: Logo · User · Icons ─────────────────────────────── */}
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl shadow-lg overflow-hidden flex items-center justify-center bg-white/10 backdrop-blur-sm ring-1 ring-white/20 transition-transform duration-300 hover:scale-105">
              <Image src="/icon.png" alt="Logo" width={36} height={36} className="w-full h-full object-cover" priority />
            </div>
            <span className="font-extrabold text-white text-lg leading-none hidden xs:block sm:block tracking-tight">เวรดี๊ดี</span>
          </div>

          {/* Month Navigator — visible on md+ */}
          <div className="hidden md:flex items-center gap-1 bg-white/[0.08] backdrop-blur-sm rounded-2xl px-1 py-0.5 border border-white/[0.08]">
            <button
              onClick={prevMonth}
              className="p-2.5 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-all duration-200 flex items-center justify-center active:scale-95"
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-bold text-white/90 w-36 text-center tracking-wide">
              {formatThaiMonth(year, month)}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2.5 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-all duration-200 flex items-center justify-center active:scale-95"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode Toggle — visible on md+ */}
          <div className="hidden md:flex items-center gap-0.5 bg-white/[0.08] backdrop-blur-sm rounded-2xl p-1 border border-white/[0.06]">
            <button
              onClick={() => onViewModeChange('all')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 tracking-wide',
                viewMode === 'all'
                  ? 'bg-white text-violet-700 shadow-lg'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              ทุกเวร
            </button>
            <button
              onClick={() => onViewModeChange('mine')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 tracking-wide',
                viewMode === 'mine'
                  ? 'bg-white text-violet-700 shadow-lg'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              )}
            >
              <User className="w-3.5 h-3.5" />
              เวรของฉัน
            </button>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-0.5 ml-auto md:ml-0">
            {onRefresh && (
              <button
                onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}
                disabled={refreshing}
                title="โหลดข้อมูลใหม่"
                className="p-2.5 min-w-[40px] min-h-[40px] rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-40 active:scale-95"
              >
                <RefreshCw className={cn("w-[18px] h-[18px]", refreshing && "animate-spin")} />
              </button>
            )}

            <button
              onClick={() => setIsGuideOpen(true)}
              title="วิธีการใช้งาน"
              className="p-2.5 min-w-[40px] min-h-[40px] rounded-xl hover:bg-white/10 text-white/50 hover:text-emerald-300 transition-all duration-200 flex items-center justify-center active:scale-95"
            >
              <HelpCircle className="w-[18px] h-[18px]" />
            </button>

            <button
              onClick={onBellClick}
              id="notifications-button"
              className="relative p-2.5 min-w-[40px] min-h-[40px] rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all duration-200 flex items-center justify-center active:scale-95"
            >
              <Bell className="w-[18px] h-[18px]" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] px-1 text-white text-[10px] font-black rounded-full flex items-center justify-center leading-none shadow-lg animate-scale-in"
                  style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                >
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>

            {/* User avatar */}
            {currentUser && (
              <button
                onClick={() => setIsProfileModalOpen(true)}
                title="แก้ไขข้อมูลส่วนตัว"
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 min-h-[40px] bg-white/[0.08] hover:bg-white/[0.15] transition-all duration-200 rounded-xl border border-white/[0.08] active:scale-[0.97] backdrop-blur-sm"
              >
                <div className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-white ring-2 ring-violet-400/50"
                  style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
                <span className="hidden sm:block text-sm font-bold text-white/90 max-w-28 lg:max-w-40 truncate leading-tight">
                  {displayName}
                </span>
              </button>
            )}

            {/* Logout */}
            {confirmingLogout ? (
              <div className="flex items-center gap-1 bg-red-500/20 border border-red-400/30 rounded-xl px-2 py-1 animate-scale-in backdrop-blur-sm">
                <span className="text-xs text-red-300 font-semibold mr-0.5 hidden sm:inline">ออกจากระบบ?</span>
                <button
                  onClick={() => setConfirmingLogout(false)}
                  className="text-xs text-white/60 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  id="logout-button"
                  className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg font-bold transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {loggingOut ? '...' : 'ออก'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingLogout(true)}
                id="logout-button"
                className="p-2.5 min-w-[40px] min-h-[40px] rounded-xl hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-all duration-200 flex items-center justify-center active:scale-95"
                title="ออกจากระบบ"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Row 2 (mobile only): Month navigator ─────── */}
        <div className="md:hidden border-t border-white/[0.06] bg-white/[0.03]">
          <div className="flex items-center justify-center px-4 py-1.5">
            <div className="flex items-center gap-1 bg-white/[0.06] rounded-2xl px-1 py-0.5 border border-white/[0.06]">
              <button
                onClick={prevMonth}
                className="p-2 min-w-[40px] min-h-[40px] rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all duration-200 flex items-center justify-center active:scale-95"
                aria-label="เดือนก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold text-white/90 text-center min-w-[7rem] tracking-wide">
                {formatThaiMonth(year, month)}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 min-w-[40px] min-h-[40px] rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all duration-200 flex items-center justify-center active:scale-95"
                aria-label="เดือนถัดไป"
              >
                <ChevronRight className="w-4 h-4" />
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
      {isGuideOpen && (
        <HelpGuideModal
          isAdmin={currentUser?.role === 'admin'}
          onClose={() => setIsGuideOpen(false)}
        />
      )}
    </>
  );
}
