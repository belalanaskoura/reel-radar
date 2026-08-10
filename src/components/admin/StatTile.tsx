export function StatTile({
  label,
  value,
  sublabel,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'neutral' | 'ok' | 'error';
}) {
  const valueColor = tone === 'ok' ? 'var(--ok-ink)' : tone === 'error' ? 'var(--error-ink)' : 'var(--ink)';

  return (
    <div
      className="rounded-sm border p-4"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
        {label}
      </p>
      <p className="font-display mt-1 text-3xl leading-none" style={{ color: valueColor }}>
        {value}
      </p>
      {sublabel && (
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-dim)' }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}
