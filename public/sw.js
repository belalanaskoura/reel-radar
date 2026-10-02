// Take over as soon as a new version is installed, rather than waiting
// for every open tab to close, so a changed notificationclick handler
// applies to the next notification and not some later one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json();

  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: payload.url,
      movieId: payload.movieId,
      movieTitle: payload.movieTitle,
      removeToken: payload.removeToken,
      removeUrl: payload.removeUrl,
    },
  };
  if (Array.isArray(payload.actions)) options.actions = payload.actions.slice(0, 2);
  if (payload.tag) {
    options.tag = payload.tag;
    // Without renotify, a notification replacing one with the same tag
    // shows up silently.
    options.renotify = true;
  }

  event.waitUntil(
    self.registration
      .showNotification(payload.title, options)
      .catch((err) => console.error('showNotification failed:', err)),
  );
});

function openOrFocus(url) {
  return self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const client of clients) {
      if (client.url === url && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  });
}

// The tap on "Remove from radar" is a deliberate gesture, so it removes
// right away in the background (the signed token is the authorization,
// no session needed). If that fails, fall back to the confirm page, and
// if the browser won't open a window that late, leave a notification
// that opens it instead.
async function removeFromRadar(data) {
  try {
    const res = await fetch('/api/radar/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.removeToken }),
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Clear any other alerts still on screen for the same movie.
    const shown = await self.registration.getNotifications();
    for (const n of shown) {
      if (n.data && n.data.movieId === data.movieId) n.close();
    }

    await self.registration.showNotification('Removed from your radar', {
      body: data.movieTitle ? `No more alerts or reminders for ${data.movieTitle}.` : 'No more alerts or reminders for this movie.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `radar-removed-${data.movieId}`,
      data: { url: new URL('/watchlist', self.location.origin).href },
    });
  } catch (err) {
    console.error('Remove from radar failed:', err);
    if (!data.removeUrl) return;
    try {
      if (await self.clients.openWindow(data.removeUrl)) return;
    } catch {
      // handled below
    }
    await self.registration.showNotification('Couldn\'t remove from radar', {
      body: 'Tap to try again.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.removeUrl },
    });
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'remove' && data.removeToken) {
    event.waitUntil(removeFromRadar(data));
    return;
  }

  // The body itself or the "open" action.
  if (!data.url) return;
  event.waitUntil(openOrFocus(data.url));
});
