'use client';

import { useEffect, useState } from 'react';

// Reads prefers-reduced-motion. Starts false on both server and client
// renders (matchMedia isn't available server-side) and corrects itself in
// an effect -- same hydration-safety shape ThemeProvider.tsx already
// documents for reading real browser state, avoids a mismatch warning.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    // queueMicrotask avoids a synchronous setState-in-effect (same
    // ThemeProvider.tsx gotcha this codebase already documents) while
    // still applying before the next paint.
    queueMicrotask(() => setReduced(query.matches));
    function handleChange(e: MediaQueryListEvent) {
      setReduced(e.matches);
    }
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
