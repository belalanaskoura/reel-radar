'use client';

import Link from 'next/link';
import { BellIcon, PlusSquareIcon, ShareIcon, SmartphoneIcon } from '@/components/icons';
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
        className="mt-4 rounded-sm border p-4 sm:p-5"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <p className="text-center text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
          On iPhone or iPad
        </p>
        <p className="mt-1 text-center text-sm" style={{ color: 'var(--ink-dim)' }}>
          Safari only sends notifications to sites added to your Home Screen.
        </p>

        <ol className="mt-5 flex items-start justify-center gap-1">
          <IosStep number={1} icon={<ShareIcon size={20} />} label="Tap Share in Safari" />
          <StepConnector />
          <IosStep number={2} icon={<PlusSquareIcon size={20} />} label="Add to Home Screen" />
          <StepConnector />
          <IosStep number={3} icon={<SmartphoneIcon size={20} />} label="Open from the new icon" />
        </ol>

        <p className="mt-4 text-center text-xs" style={{ color: 'var(--ink-dim)' }}>
          Then sign in again and turn on notifications from there.
        </p>
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

function IosStep({ number, icon, label }: { number: number; icon: React.ReactNode; label: string }) {
  return (
    <li className="flex w-20 flex-col items-center gap-2">
      <div className="relative">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
        >
          {icon}
        </div>
        <span
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {number}
        </span>
      </div>
      <p className="text-[11px] leading-tight" style={{ color: 'var(--ink-dim)' }}>
        {label}
      </p>
    </li>
  );
}

function StepConnector() {
  return (
    <div
      className="mt-5 h-px w-3 flex-shrink-0 sm:w-5"
      style={{ background: 'var(--rule)' }}
      aria-hidden="true"
    />
  );
}
