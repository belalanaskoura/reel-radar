'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useState, type ReactNode } from 'react';

// Fades/slides each page's content in on route change -- App Router has
// no built-in page-transition primitive, and the View Transitions API
// integration in Next 16 is still experimental, so this is a plain CSS
// keyframe keyed on pathname instead. `key={pathname}` forces React to
// remount the wrapper div on every navigation, which replays the
// animation (same technique as ThemeToggle's icon-swap animation).
//
// Mounting also used to replay the global color-transition rule (see
// globals.css) on every themed element inside this subtree, stacking
// with the slide/fade and making navigation feel sluggish on mobile.
// `no-color-transition` suppresses that, but only for the brief window
// the mount animation is actually running -- a permanently-applied
// version of this class was the reason the light/dark toggle felt
// abrupt everywhere except the nav bar (the only part of the page not
// wrapped by this component): it was silently killing the theme
// crossfade for the entire rest of the page, all the time, not just
// during a route change.
const MOUNT_SUPPRESS_MS = 260;

// /admin is switched between tab-to-tab far more often than any
// consumer page, and every one of its pages already does real
// multi-query server work per navigation (see e.g. the overview page's
// ~10 concurrent Supabase queries) -- stacking a forced remount + 220ms
// slide/fade on top of that made tab switching feel sluggish for no
// real benefit: the tab strip's own active-pill highlight already signals
// which page you're on, an internal ops tool doesn't need a marketing-
// style transition. Consumer-facing routes (browse, movie details, etc.)
// keep the full remount+animation unchanged.
function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Remounts (key={pathname} below) reset this back to `true` for free --
  // a fresh mount always starts suppressed, so only the transition back
  // to `false` needs an effect, not the initial `true` value itself.
  const [suppressColorTransition, setSuppressColorTransition] = useState(true);

  useLayoutEffect(() => {
    const timer = setTimeout(() => setSuppressColorTransition(false), MOUNT_SUPPRESS_MS);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (isAdminRoute(pathname)) {
    // No remount (no key={pathname}) so admin doesn't get the marketing-
    // style slide/fade at all -- but that alone made things WORSE, not
    // better: without a remount, .no-color-transition (which only ever
    // gets applied during the brief post-mount window below) never
    // applies to admin either, so the global `* { transition:
    // background-color 0.4s ease-in-out, ... }` rule (see globals.css)
    // was left fully active on every admin element. Every server-driven
    // re-render then crossfaded every changed background/border/color
    // over 0.4s instead of snapping -- on a table or stat grid with many
    // elements changing at once, that reads as slower than the original
    // animated-remount version, which at least suppressed this rule
    // during its own transition window. Applied permanently here, not
    // just post-mount, since admin never wants this crossfade at all.
    return <div className="no-color-transition">{children}</div>;
  }

  return (
    <div
      key={pathname}
      className={`page-transition${suppressColorTransition ? ' no-color-transition' : ''}`}
    >
      {children}
    </div>
  );
}
