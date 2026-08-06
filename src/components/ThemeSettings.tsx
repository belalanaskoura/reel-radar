'use client';

import { useTheme, type ThemePreference } from '@/components/ThemeProvider';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'System', icon: <MonitorIcon size={16} /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={16} /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={16} /> },
];

export function ThemeSettings() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="grid grid-cols-3 gap-1.5 rounded-sm border p-1"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg)' }}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((opt) => {
        const active = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(opt.value)}
            className="flex flex-col items-center gap-1 rounded-sm py-2 text-xs font-medium transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-ink)' : 'var(--ink-dim)',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
