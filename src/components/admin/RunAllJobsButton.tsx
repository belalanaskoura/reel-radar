'use client';

import { useState, useTransition } from 'react';
import { triggerJob } from '@/app/admin/actions';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type JobName = Parameters<typeof triggerJob>[0];

export interface JobTarget {
  job: JobName;
  branch?: string;
  label: string;
}

export function RunAllJobsButton({
  targets,
  label,
  confirmText,
  size = 'sm',
}: {
  targets: JobTarget[];
  label: string;
  confirmText: string;
  size?: 'sm' | 'md';
}) {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<{ label: string; ok: boolean; message: string }[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleConfirm() {
    setResults(null);
    startTransition(async () => {
      const outcomes: { label: string; ok: boolean; message: string }[] = [];
      // Sequential, not Promise.all: these jobs (scrape-scene/scrape-vox)
      // already rate-limit their own outbound requests per branch, but
      // running several branches concurrently would still multiply the
      // load on Scene/elCinema's servers at once -- one at a time keeps
      // this button's behavior no more aggressive than clicking each
      // branch's own button in turn.
      for (const target of targets) {
        const outcome = await triggerJob(target.job, target.branch ? { branch: target.branch } : undefined);
        outcomes.push({ label: target.label, ...outcome });
      }
      setResults(outcomes);
      setShowConfirm(false);
    });
  }

  const padding = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        className={`shrink-0 rounded-sm font-semibold tracking-wide whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-60 ${padding}`}
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        {isPending ? 'Running…' : label}
      </button>
      {results && (
        <ul className="text-xs">
          {results.map((r, i) => (
            <li key={i} style={{ color: r.ok ? 'var(--ok-ink)' : 'var(--error-ink)' }}>
              {r.label}: {r.message}
            </li>
          ))}
        </ul>
      )}
      {showConfirm && (
        <ConfirmDialog
          message={confirmText}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
