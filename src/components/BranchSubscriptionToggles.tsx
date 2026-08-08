'use client';

import { useState, useTransition } from 'react';

export interface BranchOption {
  id: string;
  name: string;
}

// null (the "All branches" master switch on) means every branch,
// including any added after this preference was last saved -- see
// updateBranchSubscriptions. Switching a specific branch off starts from
// the full branch list rather than an empty one, so the first toggle a
// user flips reads as "turn this one off" rather than "start from
// nothing and pick one."
export function BranchSubscriptionToggles({
  branches,
  initialValue,
  updateBranchSubscriptions,
}: {
  branches: BranchOption[];
  initialValue: string[] | null;
  updateBranchSubscriptions: (branchIds: string[] | null) => Promise<{ error: string | null }>;
}) {
  const [selected, setSelected] = useState<string[] | null>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: string[] | null) {
    const prev = selected;
    setSelected(next);
    setError(null);
    startTransition(async () => {
      const result = await updateBranchSubscriptions(next);
      if (result.error) {
        setError(result.error);
        setSelected(prev);
      }
    });
  }

  function toggleAll() {
    save(selected === null ? [] : null);
  }

  function toggleBranch(branchId: string) {
    const current = selected ?? branches.map((b) => b.id);
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    // Selecting every branch by hand collapses back to null (the "all,
    // including future branches" state) rather than being stored as an
    // explicit list that happens to currently match every id.
    save(next.length === branches.length ? null : next);
  }

  const isSubscribed = (branchId: string) => selected === null || selected.includes(branchId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>All branches</p>
          <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>Get notified for every cinema</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={selected === null}
          disabled={isPending}
          onClick={toggleAll}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
          style={{ background: selected === null ? 'var(--accent)' : 'var(--rule)' }}
          aria-label="Toggle all branches"
        >
          <span
            className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
            style={{ transform: selected === null ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
        {branches.map((branch) => (
          <label
            key={branch.id}
            className="flex cursor-pointer items-center gap-2.5 text-sm"
            style={{ color: 'var(--ink)' }}
          >
            <input
              type="checkbox"
              checked={isSubscribed(branch.id)}
              disabled={isPending}
              onChange={() => toggleBranch(branch.id)}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            {branch.name}
          </label>
        ))}
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
