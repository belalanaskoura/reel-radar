'use client';

import { useState, useTransition } from 'react';
import { ToggleSwitch } from '@/components/ToggleSwitch';

export function NewReleaseToggle({
  initialValue,
  updateAlertPreferences,
}: {
  initialValue: boolean;
  updateAlertPreferences: (values: { notify_new_releases: boolean }) => Promise<{ error: string | null }>;
}) {
  const [enabled, setEnabled] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await updateAlertPreferences({ notify_new_releases: next });
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
          label="Toggle new release alerts"
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
