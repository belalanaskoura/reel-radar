'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CinemaIcon } from '@/components/icons';

const SEEN_KEY = 'reelradar:seen-cinema-follow-announcement';

// One-time "here's something new" modal, shown once ever per browser
// (localStorage, not sessionStorage like PushPrompt/PushBanner -- those
// nudge toward an unresolved action and are meant to resurface every
// session until resolved; this is a one-off announcement whose whole
// value expires once it's been seen, so re-showing it every session
// would just be annoying). Gated to signed-in users server-side (see
// layout.tsx) since following a cinema requires being signed in.
//
// Must start hidden on both server and client renders -- reading
// localStorage in a useState initializer would run on the client's
// first render too, differing from the server's render and triggering
// a hydration mismatch (ThemeProvider hit this exact bug once already;
// see its own comment). The real value is read inside an async wrapper
// in an effect instead, same shape PushPrompt already uses, rather than
// calling setState synchronously in the effect body.
export function FeatureAnnouncement() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      let seen: string | null;
      try {
        seen = localStorage.getItem(SEEN_KEY);
      } catch {
        return; // storage unavailable (private mode, blocked) -- skip rather than risk showing every load
      }
      if (seen === null) setVisible(true);
    })();
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // best-effort -- if storage isn't available it'll just show again next time
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-announcement-title"
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
          <CinemaIcon size={22} />
        </div>

        <p
          className="mt-4 text-[10px] font-bold tracking-widest uppercase"
          style={{ color: 'var(--accent)' }}
        >
          New
        </p>
        <h2 id="feature-announcement-title" className="font-display mt-1 text-2xl leading-none" style={{ color: 'var(--ink)' }}>
          Follow a whole cinema
        </h2>

        <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          Now you can follow a whole branch and get notified the moment
          a movie joins or leaves its lineup, not just a single movie.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/cinemas"
            onClick={dismiss}
            className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            Browse cinemas
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
