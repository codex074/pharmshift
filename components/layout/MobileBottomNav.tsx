'use client';

import { Users, User, Bell, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
  onBellClick: () => void;
  pendingCount: number;
  onHistoryClick: () => void;
}

export function MobileBottomNav({
  viewMode, onViewModeChange, onBellClick, pendingCount, onHistoryClick,
}: MobileBottomNavProps) {
  const tabs = [
    {
      id: 'all' as const,
      label: 'ทุกเวร',
      icon: Users,
      action: () => onViewModeChange('all'),
      active: viewMode === 'all',
    },
    {
      id: 'mine' as const,
      label: 'เวรของฉัน',
      icon: User,
      action: () => onViewModeChange('mine'),
      active: viewMode === 'mine',
    },
    {
      id: 'notifications' as const,
      label: 'แจ้งเตือน',
      icon: Bell,
      action: onBellClick,
      active: false,
      badge: pendingCount,
    },
    {
      id: 'history' as const,
      label: 'ประวัติ',
      icon: History,
      action: onHistoryClick,
      active: false,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={tab.action}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-[60px] transition-colors relative',
                tab.active ? 'text-violet-600' : 'text-gray-400',
              )}
            >
              <div className="relative">
                <Icon className={cn('w-5 h-5', tab.active && 'stroke-[2.5]')} />
                {!!tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </div>
              <span className={cn(
                'text-[10px] font-medium leading-tight',
                tab.active ? 'text-violet-600' : 'text-gray-400',
              )}>
                {tab.label}
              </span>
              {tab.active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-violet-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
