'use client';

import { useEffect, useState } from 'react';

type Status = 'checking' | 'unsupported' | 'needs-install' | 'denied' | 'subscribed' | 'unsubscribed';

// iOS Safari only allows push subscriptions from a site that's been added
// to the Home Screen and launched from that icon (running in standalone
// display mode) -- a plain Safari tab has serviceWorker/PushManager
// present but subscribe() fails there, so this has to be checked before
// ever attempting to subscribe, not caught as a generic error afterward.
export function isIosSafariNotInstalled(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIos) return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !isStandalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes;
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Owns the full push lifecycle: service worker registration, permission
// request, subscribing with the app's VAPID public key, and telling the
// server about the resulting subscription (or removing it). Renders as a
// single button whose label/action reflects the current subscription
// state, checked on mount rather than assumed.
export function PushSubscribeButton({ hideIosInstallHint = false }: { hideIosInstallHint?: boolean } = {}) {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported');
        return;
      }
      if (isIosSafariNotInstalled()) {
        setStatus('needs-install');
        return;
      }
      if (Notification.permission === 'denied') {
        setStatus('denied');
        return;
      }
      try {
        const sub = await getExistingSubscription();
        setStatus(sub ? 'subscribed' : 'unsubscribed');
      } catch {
        setStatus('unsubscribed');
      }
    })();
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'unsubscribed');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('Push notifications are not configured.');

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error('Failed to save subscription.');

      setStatus('subscribed');
    } catch (err) {
      console.error('Push subscribe failed:', err);
      const message = err instanceof Error ? err.message : 'Please try again.';
      setError(`Couldn't turn on notifications: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const subscription = await getExistingSubscription();
      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus('unsubscribed');
    } catch {
      setError('Something went wrong turning off notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking') return null;

  if (status === 'unsupported') {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        Push notifications aren&apos;t supported in this browser.
      </p>
    );
  }

  if (status === 'needs-install') {
    if (hideIosInstallHint) return null;
    return (
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        On iPhone/iPad, Safari only allows notifications for sites added to
        your Home Screen. Tap the <strong>Share</strong> button, then{' '}
        <strong>Add to Home Screen</strong>, then open ReelRadar from that
        icon and turn on notifications from there.
      </p>
    );
  }

  if (status === 'denied') {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        Notifications are blocked for this site. Enable them in your browser&apos;s
        site settings to get notified when tickets go live.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:max-w-sm">
      <button
        type="button"
        onClick={status === 'subscribed' ? handleUnsubscribe : handleSubscribe}
        disabled={busy}
        className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        style={
          status === 'subscribed'
            ? { border: '1px solid var(--rule)', color: 'var(--ink)' }
            : { background: 'var(--accent)', color: 'var(--accent-ink)' }
        }
      >
        {busy
          ? 'Working...'
          : status === 'subscribed'
            ? 'Turn off notifications'
            : 'Turn on push notifications'}
      </button>
      {error && (
        <p role="alert" className="rounded-sm px-3 py-2 text-xs" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
