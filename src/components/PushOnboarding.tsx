'use client';

import Link from 'next/link';
import { BellIcon } from '@/components/icons';
import { PushSubscribeButton } from '@/components/PushSubscribeButton';

// Push setup is a single browser permission prompt, so there's no
// multi-step wizard here. PushSubscribeButton owns the actual
// permission/subscribe/unsubscribe logic; this component is just the
// surrounding explainer card.
export function PushOnboarding() {
  return (
    <div className="mx-auto max-w-md">
      <div
        className="rounded-sm border p-6 text-center sm:p-8"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
        >
          <BellIcon size={26} />
        </div>
        <h2 className="font-display mb-2 text-3xl leading-none" style={{ color: 'var(--ink)' }}>
          Turn on notifications
        </h2>
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          Your browser will ask for permission. Once you allow it, ReelRadar
          can push a notification straight to this device the moment a
          watchlisted movie is bookable, no app or account to set up.
        </p>
        <div className="mt-5 flex justify-center">
          <PushSubscribeButton />
        </div>
      </div>

      <div
        className="mt-4 rounded-sm border p-4 text-left text-sm sm:p-5"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}
      >
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>
          On iPhone or iPad
        </p>
        <p>
          Safari only allows notifications for sites added to your Home
          Screen. Before turning notifications on:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open this site in <strong>Safari</strong> (not another
            browser).
          </li>
          <li>
            Tap the <strong>Share</strong> button (the square with an
            arrow pointing up).
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>, then{' '}
            <strong>Add</strong>.
          </li>
          <li>
            Close Safari and open ReelRadar from the new icon on your Home
            Screen.
          </li>
          <li>Sign in again, then turn on notifications from there.</li>
        </ol>
      </div>

      <p className="mt-8 text-center text-sm" style={{ color: 'var(--ink-dim)' }}>
        <Link href="/browse" className="underline" style={{ color: 'var(--accent)' }}>
          Skip for now
        </Link>{' '}
        &mdash; you can always turn this on later from your profile.
      </p>
    </div>
  );
}
