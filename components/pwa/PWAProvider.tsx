'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform: string;
    }>;
  }

  interface Navigator {
    standalone?: boolean;
  }

  interface Window {
    __pwaInstallEvent?: BeforeInstallPromptEvent;
  }
}

const DISMISS_KEY = 'pharmshift:pwa-install-dismissed-at';
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIosSafariBrowser() {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

  return isIosDevice && isSafari;
}

function isAndroidBrowser() {
  if (typeof window === 'undefined') return false;

  return /Android/i.test(window.navigator.userAgent);
}

function canShowPromptAgain() {
  if (typeof window === 'undefined') return false;

  const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
  if (!dismissedAt) return true;

  const elapsed = Date.now() - Number(dismissedAt);
  return Number.isNaN(elapsed) || elapsed > DISMISS_TTL_MS;
}

export function PWAProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [showAndroidFallback, setShowAndroidFallback] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // ลงทะเบียนทันที (ไม่รอ window load) เพื่อให้เว็บผ่านเกณฑ์ติดตั้ง PWA ตั้งแต่หน้าแรกที่เข้า
    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .catch((error) => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const installed = isStandaloneMode();
    setIsInstalled(installed);
    setIsIosSafari(isIosSafariBrowser());
    setShowPrompt(!installed && canShowPromptAgain());

    // event ถูกดักจับไว้ล่วงหน้าโดย inline script ใน layout (window.__pwaInstallEvent)
    const onInstallReady = () => {
      const event = window.__pwaInstallEvent;
      if (!event) return;
      setInstallEvent(event);
      setShowPrompt(canShowPromptAgain());
    };

    onInstallReady();
    window.addEventListener('pwa-install-ready', onInstallReady);

    const onAppInstalled = () => {
      window.__pwaInstallEvent = undefined;
      setInstallEvent(null);
      setIsInstalled(true);
      setShowPrompt(false);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('appinstalled', onAppInstalled);

    // Android ที่ไม่ยิง beforeinstallprompt (Firefox ฯลฯ) → แสดงวิธีติดตั้งเองหลังรอ event 3 วิ
    const fallbackTimer = window.setTimeout(() => setShowAndroidFallback(true), 3000);

    return () => {
      window.removeEventListener('pwa-install-ready', onInstallReady);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  async function handleInstall() {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    window.__pwaInstallEvent = undefined;

    if (choice.outcome === 'accepted') {
      setShowPrompt(false);
      setInstallEvent(null);
      return;
    }

    dismissPrompt();
  }

  function dismissPrompt() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }

    setShowPrompt(false);
  }

  if (isInstalled || !showPrompt) return null;

  const showInstallButton = Boolean(installEvent);
  const showIosHint = !showInstallButton && isIosSafari;
  const showAndroidHint = !showInstallButton && !showIosHint && showAndroidFallback && isAndroidBrowser();

  if (!showIosHint && !showInstallButton && !showAndroidHint) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-3xl border border-violet-200/80 bg-white/95 p-4 shadow-[0_18px_60px_rgba(76,29,149,0.18)] backdrop-blur">
      <button
        type="button"
        onClick={dismissPrompt}
        className="absolute right-3 top-3 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        aria-label="ปิดคำแนะนำการติดตั้งแอป"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="mt-0.5 rounded-2xl bg-violet-100 p-2 text-violet-700">
          {showIosHint ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">ติดตั้งเวรดี๊ดีบนหน้าจอหลัก</p>
          {showInstallButton ? (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              เพิ่มแอปลง Home Screen เพื่อเปิดใช้งานได้ไวขึ้นและใช้งานเหมือนแอปบนมือถือหรือแท็บเล็ต
            </p>
          ) : showIosHint ? (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              บน iPhone หรือ iPad ให้เปิดผ่าน Safari แล้วแตะปุ่ม Share จากนั้นเลือก Add to Home Screen
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              เปิดเมนูของเบราว์เซอร์ แล้วเลือก &ldquo;ติดตั้งแอป&rdquo; หรือ &ldquo;เพิ่มลงในหน้าจอหลัก&rdquo;
            </p>
          )}
        </div>
      </div>

      {showInstallButton ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          ติดตั้งแอป
        </button>
      ) : (
        <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
          {showIosHint ? 'Safari -> Share -> Add to Home Screen' : 'เมนู (⋮) -> ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก'}
        </div>
      )}
    </div>
  );
}
