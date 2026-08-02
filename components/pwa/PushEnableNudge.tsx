'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  isMobilePushDevice,
  isPushSupported,
  isPWA,
  getPermissionStatus,
  getSubscriptionStatus,
  subscribeToPush,
} from '@/lib/pushNotifications';

const DISMISS_KEY = 'pharmshift:push-nudge-dismissed-at';
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function canShowAgain() {
  if (typeof window === 'undefined') return false;
  const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
  if (!dismissedAt) return true;
  const elapsed = Date.now() - Number(dismissedAt);
  return Number.isNaN(elapsed) || elapsed > DISMISS_TTL_MS;
}

interface PushEnableNudgeProps {
  userId?: string;
}

export function PushEnableNudge({ userId }: PushEnableNudgeProps) {
  const [status, setStatus] = useState<'default' | 'denied' | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Gated to installed-PWA only so this never stacks with PWAProvider's
    // install banner (same fixed bottom-4 slot) — also matches iOS, where
    // push genuinely requires standalone mode first.
    if (!userId || !isPWA() || !isMobilePushDevice() || !isPushSupported() || !canShowAgain()) return;

    const permission = getPermissionStatus();
    if (permission === 'unsupported') return;

    if (permission === 'denied') {
      setStatus('denied');
      return;
    }

    if (permission === 'granted') {
      getSubscriptionStatus().then((subscribed) => {
        if (!subscribed) setStatus('default');
      });
      return;
    }

    setStatus('default');
  }, [userId]);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setStatus(null);
  }

  async function handleEnable() {
    if (!userId) return;
    setSubscribing(true);
    const result = await subscribeToPush(userId);
    setSubscribing(false);

    if (result.ok) {
      toast.success('เปิดการแจ้งเตือนสำเร็จ');
      setStatus(null);
      return;
    }

    if (result.reason === 'PERMISSION_DENIED') {
      setStatus('denied');
      return;
    }

    toast.error('เปิดการแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  if (!status) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-3xl border border-amber-200/80 bg-white/95 p-4 shadow-[0_18px_60px_rgba(217,119,6,0.18)] backdrop-blur">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        aria-label="ปิดคำแนะนำการแจ้งเตือน"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="mt-0.5 rounded-2xl bg-amber-100 p-2 text-amber-700">
          <Bell className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">เปิดการแจ้งเตือนเวร</p>
          {status === 'denied' ? (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              เครื่องนี้ปิดการแจ้งเตือนไว้ — เปิดผ่านตั้งค่าเบราว์เซอร์ &gt; การแจ้งเตือน แล้วอนุญาตให้เว็บนี้ส่งแจ้งเตือนได้
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              เปิดไว้จะได้รับแจ้งเตือนทันทีเมื่อมีเวรหรือมีคนขอแลกเวร จะได้ไม่ลืม
            </p>
          )}
        </div>
      </div>

      {status === 'default' && (
        <button
          type="button"
          onClick={() => void handleEnable()}
          disabled={subscribing}
          className="mt-4 w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {subscribing ? 'กำลังเปิด...' : 'เปิดการแจ้งเตือน'}
        </button>
      )}
    </div>
  );
}
