import { AlertTriangleIcon, CheckIcon } from '@/components/icons';

// Severity reads via a left accent bar + icon instead of a fully bordered,
// fully tinted box -- the original design gave every alert (cache health,
// missing runs, data quality) an identical solid-red-background treatment,
// which meant a page with 2-3 active alerts was a wall of red boxes with
// no way to tell "mildly stale" from "the scheduler silently died" at a
// glance. tone='ok' (nothing to flag) still renders the same shape so a
// clean state doesn't look like a different component entirely.
export function AlertCard({
  tone,
  title,
  description,
  children,
}: {
  tone: 'ok' | 'error';
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const accent = tone === 'ok' ? 'var(--ok-ink)' : 'var(--error-ink)';
  const iconBg = tone === 'ok' ? 'var(--ok-bg)' : 'var(--error-bg)';

  return (
    <div
      className="flex gap-3.5 rounded-md py-4 pr-4 pl-4 sm:pl-5"
      style={{ background: 'var(--surface)', boxShadow: `inset 3px 0 0 0 ${accent}` }}
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: iconBg, color: accent }}
      >
        {tone === 'ok' ? <CheckIcon size={16} /> : <AlertTriangleIcon size={16} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div>
          <p className="font-display text-xl leading-none" style={{ color: accent }}>
            {title}
          </p>
          <p className="mt-1.5 text-xs leading-snug" style={{ color: 'var(--ink-dim)' }}>
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
