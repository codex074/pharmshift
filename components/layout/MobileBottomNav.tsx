'use client';

import { Users, User, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
  onBellClick: () => void;
  pendingCount: number;
}

export function MobileBottomNav({
  viewMode, onViewModeChange, onBellClick, pendingCount,
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
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/90 backdrop-blur-xl border-t border-gray-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}
    >
      <div className="flex items-center justify-around h-[58px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={tab.action}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-[60px] transition-all duration-300 relative active:scale-90',
                tab.active ? 'text-violet-600' : 'text-gray-400',
              )}
            >
              {/* Active pill indicator */}
              {tab.active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full transition-all duration-300"
                  style={{ background: 'linear-gradient(90deg, hsl(252 80% 58%), hsl(271 81% 56%))' }}
                />
              )}
              <div className={cn(
                'relative transition-all duration-300',
                tab.active && 'scale-110'
              )}>
                <Icon className={cn('w-5 h-5 transition-all duration-300', tab.active && 'stroke-[2.5]')} />
                {!!tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                  >
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                'text-[10px] font-semibold leading-tight transition-all duration-300',
                tab.active ? 'text-violet-600' : 'text-gray-400',
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
