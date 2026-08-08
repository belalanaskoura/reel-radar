'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellIcon, PlusSquareIcon, ShareIcon, SmartphoneIcon } from '@/components/icons';
import { PushSubscribeButton } from '@/components/PushSubscribeButton';
import { BranchSubscriptionToggles, type BranchOption } from '@/components/BranchSubscriptionToggles';

// Only iOS needs the "add to Home Screen first" steps -- rendering them
// unconditionally (the previous version) meant every non-iOS visitor saw
// a whole second card of irrelevant instructions, which was the main
// source of the "cluttered on mobile" complaint. Checked on mount rather
// than via CSS/UA-string matching in markup, since this needs the same
// real device check PushSubscribeButton already does internally.
function useIsIos(): boolean {
  const [isIos, setIsIos] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent)));
  }, []);
  return isIos;
}

// Push setup is a single browser permission prompt, so there's no
// multi-step wizard here -- one card holds the explainer, the button,
// and (iOS only) the Home Screen steps, instead of stacking separate
// cards that mostly repeat the same "turn on notifications" message.
export function PushOnboarding({
  showSkip = true,
  branches,
  initialBranchSubscription,
  updateBranchSubscriptions,
}: {
  showSkip?: boolean;
  branches?: BranchOption[];
  initialBranchSubscription?: string[] | null;
  updateBranchSubscriptions?: (branchIds: string[] | null) => Promise<{ error: string | null }>;
}) {
  const isIos = useIsIos();

  return (
    <div className="mx-auto max-w-md">
      <div
        className="rounded-sm border p-5 sm:p-6"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
          >
            <BellIcon size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-none" style={{ color: 'var(--ink)' }}>
              Turn on notifications
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              Your browser will ask for permission once — that&apos;s the
              whole setup.
            </p>
          </div>
        </div>

        {isIos && (
          <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--rule)' }}>
            <p className="mb-3 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--accent)' }}>
              On iPhone/iPad, first:
            </p>
            <ol className="flex items-start justify-center gap-1">
              <IosStep icon={<ShareIcon size={18} />} label="Tap Share" />
              <StepConnector />
              <IosStep icon={<PlusSquareIcon size={18} />} label="Add to Home Screen" />
              <StepConnector />
              <IosStep icon={<SmartphoneIcon size={18} />} label="Open from the new icon" />
            </ol>
            <p className="mt-3 text-center text-xs" style={{ color: 'var(--ink-dim)' }}>
              Then sign in again and turn on notifications from there.
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-center">
          <PushSubscribeButton hideIosInstallHint={isIos} />
        </div>

        {branches && branches.length > 0 && updateBranchSubscriptions && (
          <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--rule)' }}>
            <p className="mb-3 text-xs font-medium" style={{ color: 'var(--ink-dim)' }}>
              Showtime alerts by cinema
            </p>
            <BranchSubscriptionToggles
              branches={branches}
              initialValue={initialBranchSubscription ?? null}
              updateBranchSubscriptions={updateBranchSubscriptions}
            />
          </div>
        )}
      </div>

      {showSkip && (
        <p className="mt-5 text-center text-sm" style={{ color: 'var(--ink-dim)' }}>
          <Link href="/browse" className="underline" style={{ color: 'var(--accent)' }}>
            Skip for now
          </Link>{' '}
          — you can turn this on later from your profile.
        </p>
      )}
    </div>
  );
}

function IosStep({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex w-[72px] flex-col items-center gap-1.5">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
      >
        {icon}
      </div>
      <p className="text-center text-[10px] leading-tight" style={{ color: 'var(--ink-dim)' }}>
        {label}
      </p>
    </li>
  );
}

function StepConnector() {
  return (
    <div className="mt-4 h-px w-3 flex-shrink-0" style={{ background: 'var(--rule)' }} aria-hidden="true" />
  );
}
