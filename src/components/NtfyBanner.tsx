'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BellIcon } from '@/components/icons';

const DISMISS_KEY = 'reelradar:ntfy-banner-dismissed';
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return sessionStorage.getItem(DISMISS_KEY) !== null;
}

function getServerSnapshot() {
  return false;
}

function dismiss() {
  sessionStorage.setItem(DISMISS_KEY, '1');
  listeners.forEach((callback) => callback());
}

export function NtfyBanner() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (dismissed) return null;

  return (
    <div
      className="relative flex items-center gap-4 rounded-sm border p-4"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
      >
        <BellIcon size={18} />
      </div>
      <p className="pr-6 text-sm" style={{ color: 'var(--ink)' }}>
        Get notified the instant tickets go live:{' '}
        <Link href="/notifications" className="underline" style={{ color: 'var(--accent)' }}>
          set up push notifications
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 rounded-sm p-1 transition-opacity hover:opacity-70"
        style={{ color: 'var(--ink-dim)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
