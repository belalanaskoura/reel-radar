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

  return (
    <div
      key={pathname}
      className={`page-transition${suppressColorTransition ? ' no-color-transition' : ''}`}
    >
      {children}
    </div>
  );
}
