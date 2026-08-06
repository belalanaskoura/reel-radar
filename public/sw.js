self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json();

  event.waitUntil(
    self.registration
      .showNotification(payload.title, {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.url },
      })
      .catch((err) => console.error('showNotification failed:', err)),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
