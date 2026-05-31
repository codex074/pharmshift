'use client';

import { useEffect, useRef } from 'react';

/**
 * Re-sync data automatically when the app regains attention, so users don't have
 * to hit "refresh" after Realtime goes stale (PWA backgrounding on iOS kills the
 * websocket; flaky hospital wifi drops it too).
 *
 * Fires `onSync` on:
 *   - tab/window becoming visible again (`visibilitychange`)
 *   - network coming back online (`online`)
 *
 * A min-interval guard prevents thrash (e.g. quick tab flips) from spamming
 * full refetches — important on Supabase free-tier egress.
 */
export function useAutoSync(
  onSync: () => void | Promise<void>,
  { minIntervalMs = 8000, enabled = true }: { minIntervalMs?: number; enabled?: boolean } = {},
) {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const lastSyncRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      const now = Date.now();
      if (now - lastSyncRef.current < minIntervalMs) return;
      lastSyncRef.current = now;
      void onSyncRef.current();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, minIntervalMs]);
}
