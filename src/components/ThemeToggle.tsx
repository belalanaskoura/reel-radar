'use client';

import { useTheme, type ThemePreference } from '@/components/ThemeProvider';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const ICONS: Record<ThemePreference, React.ReactNode> = {
  system: <MonitorIcon size={16} />,
  light: <SunIcon size={16} />,
  dark: <MoonIcon size={16} />,
};
const LABELS: Record<ThemePreference, string> = {
  system: 'Theme: matching your device',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

// One-tap cycle through system -> light -> dark -> system, for the nav
// bar where there's no room for a labeled 3-way control. Shows the icon
// for the current *preference*, not the resolved theme, so "system" on
// a dark device still shows the monitor icon, not the moon -- otherwise
// a user could never tell "system" apart from "dark" by looking at it.
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  function cycle() {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
    setPreference(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={LABELS[preference]}
      title={LABELS[preference]}
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-opacity hover:opacity-70 sm:h-8 sm:w-8"
      style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
    >
      <span key={preference} className="theme-icon-swap flex items-center justify-center">
        {ICONS[preference]}
      </span>
    </button>
  );
}
