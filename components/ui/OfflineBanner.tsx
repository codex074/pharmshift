'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * U1: connectivity indicator. Hospital wifi is flaky — when the browser goes
 * offline, background fetches fail silently and the UI shows stale data with no
 * explanation. This pins a banner so the user knows why nothing is updating.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-white text-xs sm:text-sm font-bold shadow-lg"
      style={{ background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)' }}
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>ออฟไลน์อยู่ — ข้อมูลอาจไม่อัปเดต กรุณาตรวจสอบการเชื่อมต่อ</span>
    </div>
  );
}
