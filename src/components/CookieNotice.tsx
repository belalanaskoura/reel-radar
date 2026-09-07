'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const DISMISSED_KEY = 'reelradar:cookie-notice-dismissed';

// A notice, not a consent gate -- every cookie ReelRadar sets (Supabase
// auth session, the admin session cookie) is strictly necessary, and
// strictly-necessary cookies don't require opt-in consent under GDPR/
// ePrivacy. This just links to the Cookie Policy so visitors know
// cookies are in use, with no accept/reject choice to make since there's
// no optional cookie to opt in or out of. Shown to everyone (not gated
// to signed-in users like ProductUpdates) since it's a site-wide legal
// notice, not a feature announcement.
//
// Must start hidden on both server and client renders -- same
// hydration-mismatch reasoning as ProductUpdates' own comment, since
// reading localStorage in a useState initializer would differ between
// server and client first render.
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (localStorage.getItem(DISMISSED_KEY) !== '1') setVisible(true);
      } catch {
        setVisible(true); // storage unavailable -- fail open, just show it
      }
    })();
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // best-effort -- if storage isn't available it'll just show again next time
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3.5 sm:px-6"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      role="region"
      aria-label="Cookie notice"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          ReelRadar uses only strictly-necessary cookies to keep you signed in — no ads, no
          tracking.{' '}
          <Link href="/cookies" className="underline" style={{ color: 'var(--accent)' }}>
            Learn more
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-sm px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
