'use client';

import { Ripple } from '@/components/ui/ripple';

interface LoadingOverlayProps {
  /** 'fixed' = overlay ทับหน้า (login), 'screen' = เต็มจอ (page transition) */
  variant?: 'fixed' | 'screen';
}

export function LoadingOverlay({ variant = 'fixed' }: LoadingOverlayProps) {
  const base =
    variant === 'screen'
      ? 'min-h-screen w-full flex items-center justify-center bg-white'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md';

  return (
    <div className={base}>
      <div className="relative flex items-center justify-center w-full h-full">
        <Ripple mainCircleSize={120} mainCircleOpacity={0.24} numCircles={8} />
        <p className="relative z-10 text-sm font-semibold text-gray-400 tracking-widest uppercase">
          loading
        </p>
      </div>
    </div>
  );
}
