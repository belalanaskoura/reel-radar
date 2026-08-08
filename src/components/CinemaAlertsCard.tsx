'use client';

import { useState, useTransition } from 'react';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { CinemaIcon, CheckIcon } from '@/components/icons';
import type { BranchOption } from '@/components/BranchSubscriptionToggles';

// Combines what used to be two separately-stated controls (AlertToggles'
// Cinema Showtimes switch, BranchSubscriptionToggles' branch list) into
// one card that owns both together. The branch list visibly dims and
// disables when the master switch is off, instead of staying fully
// interactive with no visual cue it currently does nothing.
//
// Branches render as a tappable card grid (radar-style "signal" dot per
// cinema, filled/pulsing when watched) rather than a plain checkbox list
// -- ties into the app's own radar branding (see RadarLogo) instead of a
// generic settings-form look, since this specific card is literally "which
// signals are we watching for you."
export function CinemaAlertsCard({
  branches,
  initialEnabled,
  initialBranchIds,
  updateCinemaAlerts,
}: {
  branches: BranchOption[];
  initialEnabled: boolean;
  initialBranchIds: string[] | null;
  updateCinemaAlerts: (values: {
    notify_cinema_showtimes: boolean;
    subscribed_branch_ids: string[] | null;
  }) => Promise<{ error: string | null }>;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selectedBranches, setSelectedBranches] = useState<string[] | null>(initialBranchIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: { enabled: boolean; branches: string[] | null }) {
    const prev = { enabled, branches: selectedBranches };
    setEnabled(next.enabled);
    setSelectedBranches(next.branches);
    setError(null);
    startTransition(async () => {
      const result = await updateCinemaAlerts({
        notify_cinema_showtimes: next.enabled,
        subscribed_branch_ids: next.branches,
      });
      if (result.error) {
        setError(result.error);
        setEnabled(prev.enabled);
        setSelectedBranches(prev.branches);
      }
    });
  }

  function toggleAllBranches() {
    save({ enabled, branches: selectedBranches === null ? [] : null });
  }

  function toggleBranch(branchId: string) {
    const current = selectedBranches ?? branches.map((b) => b.id);
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    // Selecting every branch by hand collapses back to null (the "all,
    // including future branches" state) rather than being stored as an
    // explicit list that happens to currently match every id.
    save({ enabled, branches: next.length === branches.length ? null : next });
  }

  const isSubscribed = (branchId: string) => selectedBranches === null || selectedBranches.includes(branchId);
  const branchesInteractive = enabled && !isPending;
  const watchedCount = selectedBranches === null ? branches.length : selectedBranches.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            {enabled && (
              <span
                className="absolute inset-0 rounded-full"
                style={{ background: 'var(--accent)', opacity: 0.35 }}
              >
                <span className="signal-ping absolute inset-0 rounded-full" style={{ background: 'var(--accent)', opacity: 0.6 }} />
              </span>
            )}
            <span
              className="relative flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-300"
              style={{ background: enabled ? 'var(--accent)' : 'var(--rule)' }}
            />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {enabled ? `Watching ${watchedCount} of ${branches.length}` : 'Off'}
          </p>
        </div>
        <ToggleSwitch
          checked={enabled}
          disabled={isPending}
          onChange={() => save({ enabled: !enabled, branches: selectedBranches })}
          label="Toggle cinema showtime alerts"
        />
      </div>

      {branches.length > 0 && (
        <div
          className="flex flex-col gap-3 border-t pt-4 transition-opacity duration-300"
          style={{ borderColor: 'var(--rule)', opacity: enabled ? 1 : 0.4 }}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-medium" style={{ color: 'var(--ink-dim)' }}>
              All branches
            </p>
            <ToggleSwitch
              checked={selectedBranches === null}
              disabled={!branchesInteractive}
              onChange={toggleAllBranches}
              label="Toggle all branches"
              size="sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {branches.map((branch, i) => {
              const subscribed = isSubscribed(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  role="checkbox"
                  aria-checked={subscribed}
                  disabled={!branchesInteractive}
                  onClick={() => toggleBranch(branch.id)}
                  className="branch-chip-in group relative flex flex-col items-start gap-2 overflow-hidden rounded-sm border p-2.5 text-left transition-colors duration-200 active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100"
                  style={{
                    borderColor: subscribed ? 'var(--accent)' : 'var(--rule)',
                    background: subscribed ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)',
                    animationDelay: `${i * 30}ms`,
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <CinemaIcon
                      size={16}
                      style={{ color: subscribed ? 'var(--accent)' : 'var(--ink-dim)' }}
                      className="transition-colors duration-200"
                    />
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-all duration-200"
                      style={{
                        background: subscribed ? 'var(--accent)' : 'transparent',
                        boxShadow: subscribed ? 'none' : 'inset 0 0 0 1.5px var(--rule)',
                        transform: subscribed ? 'scale(1)' : 'scale(0.7)',
                        opacity: subscribed ? 1 : 0.7,
                      }}
                    >
                      {subscribed && <CheckIcon size={10} style={{ color: 'var(--accent-ink)' }} />}
                    </span>
                  </div>
                  <span
                    className="text-xs leading-tight font-medium"
                    style={{ color: subscribed ? 'var(--ink)' : 'var(--ink-dim)' }}
                  >
                    {branch.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
