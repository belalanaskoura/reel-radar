'use client';

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'reelradar:theme';

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

// Kept in sync with the inline script in layout.tsx, which sets the same
// attribute before first paint (avoids a flash of the wrong theme) --
// this provider takes over from there so a toggle click updates instantly
// without a reload, and other components (ThemeToggle in the nav,
// ThemeSettings in the profile) share one source of truth via context
// rather than each reading localStorage independently. Same context
// pattern as SearchProvider.
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Must start as 'system' on both server and client -- the very first
  // client render has to match the server-rendered HTML exactly, or
  // React discards and re-renders the whole tree (the hydration mismatch
  // this component originally shipped with: reading real localStorage in
  // a useState initializer runs on that first client render too, which
  // differs from what the server saw). The real stored value is applied
  // in a layout effect immediately after, synchronously before the
  // browser paints, so there's still no visible flash -- same reasoning
  // as the beforeInteractive inline script in layout.tsx, just for
  // React's own state rather than the DOM attribute.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useLayoutEffect(() => {
    queueMicrotask(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  function setPreference(p: ThemePreference) {
    setPreferenceState(p);
    localStorage.setItem(STORAGE_KEY, p);
    applyTheme(p);
  }

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
