import { isMobileUserAgent } from '@/lib/deviceDetection';

/**
 * Client-side Web Push Notification utilities
 */

/** Convert VAPID public key from base64url to Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Check if Push API is supported */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Check if current browser is on a mobile device */
export function isMobilePushDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return isMobileUserAgent(window.navigator.userAgent);
}

/** Check if the app is running as a standalone PWA */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-ignore — iOS Safari
    window.navigator.standalone === true
  );
}

/** Check if running on iOS Safari (non-PWA) — push requires standalone mode on iOS */
export function isIosNonPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari && !isPWA();
}

/** Get current notification permission status */
export function getPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// ── Subscribe result ──

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_SUPPORTED' | 'PERMISSION_DENIED' | 'PERMISSION_DISMISSED' | 'NO_VAPID_KEY' | 'SW_TIMEOUT' | 'SUBSCRIBE_FAILED' | 'SERVER_ERROR'; detail?: string };

/** Subscribe this device to push notifications */
export async function subscribeToPush(userId: string): Promise<SubscribeResult> {
  if (!isMobilePushDevice()) {
    return { ok: false, reason: 'NOT_SUPPORTED', detail: 'Push notifications are limited to mobile devices.' };
  }

  if (!isPushSupported()) {
    return { ok: false, reason: 'NOT_SUPPORTED' };
  }

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'PERMISSION_DENIED' };
  }

  // Wait for SW with a 10-second timeout
  let registration: ServiceWorkerRegistration;
  try {
    registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SW_TIMEOUT')), 10_000)
      ),
    ]);
  } catch {
    return { ok: false, reason: 'SW_TIMEOUT' };
  }

  // Check existing subscription
  let subscription: PushSubscription | null;
  try {
    subscription = await registration.pushManager.getSubscription();
  } catch (err: any) {
    return { ok: false, reason: 'SUBSCRIBE_FAILED', detail: err?.message };
  }

  if (!subscription) {
    // Request permission (shows browser prompt)
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        return { ok: false, reason: 'PERMISSION_DENIED' };
      }
      if (permission !== 'granted') {
        return { ok: false, reason: 'PERMISSION_DISMISSED' };
      }
    } catch (err: any) {
      return { ok: false, reason: 'SUBSCRIBE_FAILED', detail: `requestPermission: ${err?.message}` };
    }

    // VAPID key
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      return { ok: false, reason: 'NO_VAPID_KEY' };
    }

    // Subscribe to push manager
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    } catch (err: any) {
      return { ok: false, reason: 'SUBSCRIBE_FAILED', detail: `pushManager.subscribe: ${err?.message}` };
    }
  }

  // Save to server
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        subscription: subscription.toJSON(),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, reason: 'SERVER_ERROR', detail: `${res.status} ${body.slice(0, 200)}` };
    }
  } catch (err: any) {
    return { ok: false, reason: 'SERVER_ERROR', detail: err?.message };
  }

  return { ok: true };
}

/** Check whether this device has an active push subscription */
export async function getSubscriptionStatus(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

/** Unsubscribe this device from push notifications */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Remove from server
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      // Unsubscribe locally
      await subscription.unsubscribe();
    }

    return true;
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err);
    return false;
  }
}
