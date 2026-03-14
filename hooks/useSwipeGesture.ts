'use client';
import { useRef, useEffect } from 'react';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  maxVertical?: number;
}

export function useSwipeGesture<T extends HTMLElement>(config: SwipeConfig) {
  const ref = useRef<T>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const threshold = config.threshold ?? 50;
    const maxVertical = config.maxVertical ?? 100;

    const handleTouchStart = (e: TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);

      if (dy > maxVertical) { touchStart.current = null; return; }

      if (dx > threshold) config.onSwipeRight?.();
      else if (dx < -threshold) config.onSwipeLeft?.();

      touchStart.current = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [config.onSwipeLeft, config.onSwipeRight, config.threshold, config.maxVertical]);

  return ref;
}
