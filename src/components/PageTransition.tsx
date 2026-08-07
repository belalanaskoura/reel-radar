'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Fades/slides each page's content in on route change -- App Router has
// no built-in page-transition primitive, and the View Transitions API
// integration in Next 16 is still experimental, so this is a plain CSS
// keyframe keyed on pathname instead. `key={pathname}` forces React to
// remount the wrapper div on every navigation, which replays the
// animation (same technique as ThemeToggle's icon-swap animation).
// Gated behind prefers-reduced-motion via the .page-transition class
// itself (see globals.css), not here.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
