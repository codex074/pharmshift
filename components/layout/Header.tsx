'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Users, User } from 'lucide-react';
import { RefreshIcon3D, HelpIcon3D, BellIcon3D } from '@/components/ui/icons3d';
import PharmSwal from '@/lib/swal';
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
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  async function handleLogout() {
    const result = await PharmSwal.fire({
      title: 'ออกจากระบบ?',
      html: '<span style="font-size:14px;color:#64748b">คุณต้องการออกจากระบบใช่หรือไม่</span>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '🚪 ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      reverseButtons: true,
      focusCancel: true,
    });
    if (!result.isConfirmed) return;
    setLoggingOut(true);
    try {
      const { unsubscribeFromPush } = await import('@/lib/pushNotifications');
      await unsubscribeFromPush();
    } catch {
      // Best-effort cleanup. Logout should continue even if push cleanup fails.
    }

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
                className="p-1.5 min-w-[40px] min-h-[40px] rounded-xl hover:scale-110 transition-all duration-200 flex items-center justify-center disabled:opacity-40 active:scale-95"
              >
                <RefreshIcon3D spinning={refreshing} />
              </button>
            )}

            <button
              onClick={() => setIsGuideOpen(true)}
              title="วิธีการใช้งาน"
              className="p-1.5 min-w-[40px] min-h-[40px] rounded-xl hover:scale-110 transition-all duration-200 flex items-center justify-center active:scale-95"
            >
              <HelpIcon3D />
            </button>

            <button
              onClick={onBellClick}
              id="notifications-button"
              className="relative p-1.5 min-w-[40px] min-h-[40px] rounded-xl hover:scale-110 transition-all duration-200 flex items-center justify-center active:scale-95"
            >
              <BellIcon3D />
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
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              id="logout-button"
              title="ออกจากระบบ"
              className="p-1.5 min-w-[40px] min-h-[40px] rounded-xl hover:scale-110 transition-all duration-200 flex items-center justify-center active:scale-95 disabled:opacity-50"
            >
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(239,68,68,0.5))' }}>
                <defs>
                  <radialGradient id="icon3d-logout-bg" cx="38%" cy="32%" r="70%">
                    <stop offset="0%"   stopColor="#fca5a5" />
                    <stop offset="55%"  stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#7f1d1d" />
                  </radialGradient>
                  <radialGradient id="icon3d-logout-gl" cx="48%" cy="22%" r="52%">
                    <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="30" height="30" rx="9" fill="url(#icon3d-logout-bg)" />
                <rect width="30" height="15" rx="9" fill="url(#icon3d-logout-gl)" />
                {/* Door frame */}
                <path d="M13 8h-4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
                {/* Arrow out */}
                <path d="M17 19l4-4-4-4" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="21" y1="15" x2="12" y2="15" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                {/* Shine */}
                <ellipse cx="11" cy="9.5" rx="4" ry="2.2" fill="white" opacity="0.25" />
              </svg>
            </button>
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
