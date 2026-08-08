'use client';

import { useEffect, useRef, useState } from 'react';

const CLOSE_DURATION_MS = 120; // matches .dropdown-menu-out's animation-duration in globals.css

// Keeps a conditionally-rendered element mounted for CLOSE_DURATION_MS
// after `open` flips false, so its close animation gets to play instead
// of the element vanishing mid-frame the instant `open && (...)` becomes
// false. Returns whether to render at all, and which animation class to
// apply. Shared by FilterDropdown/CinemaFilterDropdown so both dropdowns'
// open/close motion stays in sync rather than each component reimplementing
// its own timeout.
export function useAnimatedOpen(open: boolean): { mounted: boolean; animationClass: string } {
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);

  useEffect(() => {
    // Only run the close animation for a real open -> closed transition,
    // never on mount when `open` simply starts false (there's nothing to
    // animate out of in that case).
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;

    setClosing(true);
    const timeout = setTimeout(() => setClosing(false), CLOSE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  return { mounted: open || closing, animationClass: open ? 'dropdown-menu-in' : 'dropdown-menu-out' };
}
