'use client';

import { useState, useTransition } from 'react';

const ALERTS = [
  { key: 'notify_new_releases', label: 'New Releases', description: 'Egypt release date confirmed for watchlisted films' },
  { key: 'notify_cinema_showtimes', label: 'Cinema Showtimes', description: 'Local screenings for saved films' },
] as const;

type AlertKey = (typeof ALERTS)[number]['key'];

export function AlertToggles({
  initialValues,
  updateAlertPreferences,
}: {
  initialValues: Record<AlertKey, boolean>;
  updateAlertPreferences: (values: Record<AlertKey, boolean>) => Promise<{ error: string | null }>;
}) {
  const [states, setStates] = useState<Record<AlertKey, boolean>>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(key: AlertKey) {
    const next = { ...states, [key]: !states[key] };
    setStates(next);
    setError(null);
    startTransition(async () => {
      const result = await updateAlertPreferences(next);
      if (result.error) {
        setError(result.error);
        setStates(states); // revert on failure
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {ALERTS.map((alert) => (
        <div key={alert.key} className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{alert.label}</p>
            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>{alert.description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={states[alert.key]}
            disabled={isPending}
            onClick={() => toggle(alert.key)}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
            style={{ background: states[alert.key] ? 'var(--accent)' : 'var(--rule)' }}
            aria-label={`Toggle ${alert.label}`}
          >
            <span
              className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
              style={{ transform: states[alert.key] ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>
      ))}
      {error && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
