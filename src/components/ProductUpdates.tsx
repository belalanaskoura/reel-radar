'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CinemaIcon, type IconProps } from '@/components/icons';

interface ProductUpdate {
  id: string;
  icon: (props: IconProps) => React.ReactElement;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

// Ordered oldest-first: a user who missed several releases sees each
// once, in this order, one per page load -- not just the newest. Add a
// new entry here when shipping something worth announcing; nothing
// else needs to change. `id` must never be reused or changed once
// shipped, since it's the identity stored in localStorage to track
// what's been seen.
const UPDATES: ProductUpdate[] = [
  {
    id: 'cinema-follow',
    icon: CinemaIcon,
    title: 'Follow a whole cinema',
    description:
      'Now you can follow a whole branch and get notified the moment a movie joins or leaves its lineup, not just a single movie.',
    ctaLabel: 'Browse cinemas',
    ctaHref: '/cinemas',
  },
];

const SEEN_KEY = 'reelradar:seen-product-updates';

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// One-time "here's something new" modal, generic across any number of
// future announcements -- shows the oldest one a given browser hasn't
// seen yet, one at a time (dismissing shows the next on a later visit,
// rather than never showing again after the first). Persisted via
// localStorage, not sessionStorage like PushPrompt/PushBanner -- those
// nudge toward an unresolved action and are meant to resurface every
// session, but an announcement's value is spent once seen, so
// resurfacing it every session would just be annoying. Gated to
// signed-in users only in layout.tsx, since every update so far has
// pointed at something that requires being signed in.
//
// Must start hidden on both server and client renders -- reading
// localStorage in a useState initializer would run on the client's
// first render too, differing from the server's render and triggering
// a hydration mismatch (ThemeProvider hit this exact bug once already;
// see its own comment). The real value is read inside an async wrapper
// in an effect instead, same shape PushPrompt already uses, rather than
// calling setState synchronously in the effect body.
export function ProductUpdates() {
  const [update, setUpdate] = useState<ProductUpdate | null>(null);

  useEffect(() => {
    (async () => {
      let seenIds: Set<string>;
      try {
        seenIds = readSeenIds();
      } catch {
        return; // storage unavailable (private mode, blocked) -- skip rather than risk showing every load
      }
      const next = UPDATES.find((u) => !seenIds.has(u.id));
      if (next) setUpdate(next);
    })();
  }, []);

  function dismiss() {
    if (update) {
      try {
        const seenIds = readSeenIds();
        seenIds.add(update.id);
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds]));
      } catch {
        // best-effort -- if storage isn't available it'll just show again next time
      }
    }
    setUpdate(null);
  }

  if (!update) return null;

  const Icon = update.icon;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-update-title"
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
          <Icon size={22} />
        </div>

        <p
          className="mt-4 text-[10px] font-bold tracking-widest uppercase"
          style={{ color: 'var(--accent)' }}
        >
          New
        </p>
        <h2 id="product-update-title" className="font-display mt-1 text-2xl leading-none" style={{ color: 'var(--ink)' }}>
          {update.title}
        </h2>

        <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          {update.description}
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Link
            href={update.ctaHref}
            onClick={dismiss}
            className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {update.ctaLabel}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--ink-dim)' }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
