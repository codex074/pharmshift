/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Push event — show native notification
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json() as {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      url?: string;
      tag?: string;
    };

    const options: NotificationOptions = {
      body: payload.body,
      icon: payload.icon || '/icon-192x192.png',
      badge: payload.badge || '/icon-192x192.png',
      tag: payload.tag || 'default',
      data: { url: payload.url || '/' },
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'เปิดดู' },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(payload.title, options)
    );
  } catch {
    // Fallback for plain text
    event.waitUntil(
      self.registration.showNotification('เวรดี๊ดี', {
        body: event.data.text(),
        icon: '/icon-192x192.png',
      })
    );
  }
});

// Notification click — open app or focus existing tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data?.url as string) || '/calendar';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing tab
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (url !== '/') client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
