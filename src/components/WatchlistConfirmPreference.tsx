'use client';

import { useState, useTransition } from 'react';

type Preference = 'ask' | 'always_remove' | 'always_keep';

const OPTIONS: { value: Preference; label: string }[] = [
  { value: 'ask', label: 'Ask every time' },
  { value: 'always_remove', label: 'Always remove' },
  { value: 'always_keep', label: 'Never remove' },
];

// Controls whether WatchlistGrid's "Remove from watchlist?" dialog
// shows at all -- set via that dialog's own "don't ask me again"
// checkbox (whichever button the user pressed there becomes the
// permanent choice), and changeable back to "ask" (or the other way)
// here if they change their mind later.
export function WatchlistConfirmPreference({
  initialValue,
  updateWatchlistConfirmPreference,
}: {
  initialValue: Preference;
  updateWatchlistConfirmPreference: (value: Preference) => Promise<{ error: string | null }>;
}) {
  const [value, setValue] = useState<Preference>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: Preference) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updateWatchlistConfirmPreference(next);
      if (result.error) {
        setError(result.error);
        setValue(prev);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 xs:flex-row xs:gap-0 xs:rounded-sm xs:border" style={{ borderColor: 'var(--rule)' }}>
        {OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={isPending}
              onClick={() => select(opt.value)}
              className="flex-1 rounded-sm px-3 py-2 text-xs font-medium transition-opacity hover:opacity-90 xs:rounded-none disabled:cursor-not-allowed disabled:opacity-60"
              style={
                active
                  ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                  : { background: 'var(--bg)', color: 'var(--ink-dim)', border: '1px solid var(--rule)' }
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
