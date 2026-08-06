'use client';

import { useEffect, useState } from 'react';

// TEMPORARY diagnostic page, viewable directly on a phone with no dev
// tools available. Dumps on-device push/PWA state as plain text and lets
// you fire a local (non-network) test notification to isolate whether
// the problem is push delivery or notification display itself. Remove
// once the real push issue is resolved.
export default function PushDebugPage() {
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [log, setLog] = useState<string[]>([]);

  function addLog(line: string) {
    setLog((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} ${line}`]);
  }

  useEffect(() => {
    (async () => {
      const out: Record<string, unknown> = {};
      out.userAgent = navigator.userAgent;
      out.displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
      out.navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
      out.hasServiceWorker = 'serviceWorker' in navigator;
      out.hasPushManager = 'PushManager' in window;
      out.hasNotification = typeof Notification !== 'undefined';
      out.notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : null;

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        out.swRegistered = !!reg;
        out.swScope = reg?.scope ?? null;
        out.swActiveState = reg?.active?.state ?? null;
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          out.hasSubscription = !!sub;
          out.subscriptionEndpoint = sub?.endpoint ?? null;
        }
      } catch (e) {
        out.swError = String(e);
      }

      setInfo(out);
    })();
  }, []);

  async function fireLocalNotification() {
    addLog('Requesting permission...');
    try {
      const permission = await Notification.requestPermission();
      addLog(`Permission: ${permission}`);
      if (permission !== 'granted') return;

      addLog('Getting service worker registration...');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      addLog(`SW ready, scope: ${reg.scope}`);

      addLog('Calling showNotification directly (no network)...');
      await reg.showNotification('Local test notification', {
        body: 'If you see this, notification DISPLAY works on this device.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      });
      addLog('showNotification() resolved without throwing.');
    } catch (e) {
      addLog(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-sm" style={{ color: 'var(--ink)' }}>
      <h1 className="mb-4 text-2xl font-bold">Push Debug</h1>

      <button
        type="button"
        onClick={fireLocalNotification}
        className="mb-4 rounded-sm px-4 py-2.5 font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        Fire local test notification (no network)
      </button>

      <div className="mb-4 rounded-sm border p-3" style={{ borderColor: 'var(--rule)' }}>
        <p className="mb-1 font-semibold">Log:</p>
        {log.length === 0 && <p style={{ color: 'var(--ink-dim)' }}>(nothing yet)</p>}
        {log.map((line, i) => (
          <p key={i} className="font-mono text-xs break-all">{line}</p>
        ))}
      </div>

      <div className="rounded-sm border p-3" style={{ borderColor: 'var(--rule)' }}>
        <p className="mb-1 font-semibold">Device info:</p>
        <pre className="overflow-x-auto text-xs whitespace-pre-wrap break-all">
          {JSON.stringify(info, null, 2)}
        </pre>
      </div>
    </main>
  );
}
