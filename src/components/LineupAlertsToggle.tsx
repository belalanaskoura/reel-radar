'use client';

import { useState, useTransition } from 'react';
import { ToggleSwitch } from '@/components/ToggleSwitch';

export function LineupAlertsToggle({
  initialValue,
  updateLineupAlerts,
}: {
  initialValue: boolean;
  updateLineupAlerts: (values: { notify_cinema_lineup: boolean }) => Promise<{ error: string | null }>;
}) {
  const [enabled, setEnabled] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await updateLineupAlerts({ notify_cinema_lineup: next });
      if (result.error) {
        setError(result.error);
        setEnabled(!next);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Enabled</p>
        <ToggleSwitch
          checked={enabled}
          disabled={isPending}
          onChange={toggle}
          label="Toggle cinema lineup alerts"
        />
      </div>
      {error && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
