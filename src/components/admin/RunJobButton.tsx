'use client';

import { useState, useTransition } from 'react';
import { triggerJob } from '@/app/admin/actions';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type JobName = Parameters<typeof triggerJob>[0];

export function RunJobButton({
  job,
  branch,
  label,
  confirmText,
  size = 'md',
}: {
  job: JobName;
  branch?: string;
  label: string;
  confirmText: string;
  size?: 'sm' | 'md';
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleConfirm() {
    setResult(null);
    startTransition(async () => {
      const outcome = await triggerJob(job, branch ? { branch } : undefined);
      setResult(outcome);
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
        className={`shrink-0 rounded-sm border font-semibold tracking-wide whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-60 ${padding}`}
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
      >
        {isPending ? 'Running…' : label}
      </button>
      {result && (
        <p className="text-xs" style={{ color: result.ok ? 'var(--ok-ink)' : 'var(--error-ink)' }}>
          {result.message}
        </p>
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
