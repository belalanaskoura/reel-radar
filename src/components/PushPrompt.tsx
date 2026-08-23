'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellIcon } from '@/components/icons';
import { isIosSafariNotInstalled } from '@/components/PushSubscribeButton';

const DISMISS_KEY = 'reelradar:push-prompt-dismissed';

type Visibility = 'hidden' | 'default' | 'ios-needs-install';

async function hasExistingSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const sub = await registration.pushManager.getSubscription();
  return !!sub;
}

// Global once-per-session nudge toward /notifications, on top of (not
// replacing) PushBanner's inline reminder on /browse -- shown as a real
// modal since a page-level banner is easy to miss on first visit. Only
// worth showing when there's something the visitor could actually do
// about it: skipped outright for unsupported browsers or a blocked
// permission (matches PushSubscribeButton's own 'unsupported'/'denied'
// handling), and adapted rather than skipped for iOS Safari not yet
// installed as a Home Screen app, since that's a fixable, common case
// covered by /notifications' own onboarding steps.
export function PushPrompt() {
  const [visibility, setVisibility] = useState<Visibility>('hidden');

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) !== null) return;

    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission === 'denied') return;
      if (isIosSafariNotInstalled()) {
        setVisibility('ios-needs-install');
        return;
      }
      if (await hasExistingSubscription()) return;
      setVisibility('default');
    })();
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setVisibility('hidden');
  }

  if (visibility === 'hidden') return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
    >
      <div
        className="dropdown-menu-in absolute inset-0"
        style={{ background: 'color-mix(in srgb, black 55%, transparent)' }}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        className="dropdown-menu-in relative w-full max-w-sm rounded-sm border p-6"
        style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 rounded-sm p-1 transition-opacity hover:opacity-70"
          style={{ color: 'var(--ink-dim)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
        >
          <BellIcon size={22} />
        </div>

        <h2 id="push-prompt-title" className="font-display mt-4 text-2xl leading-none" style={{ color: 'var(--ink)' }}>
          Turn on notifications
        </h2>

        {visibility === 'ios-needs-install' ? (
          <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
            On iPhone/iPad, add ReelRadar to your Home Screen first. Then
            you can turn on notifications and get told the instant tickets
            go live.
          </p>
        ) : (
          <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
            Get told the instant a watchlisted movie&apos;s tickets go live,
            with one browser prompt. That&apos;s the whole setup.
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/notifications"
            onClick={dismiss}
            className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {visibility === 'ios-needs-install' ? 'Show me how' : 'Turn on notifications'}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--ink-dim)' }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
