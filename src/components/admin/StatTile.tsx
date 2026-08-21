// No outer border -- a page with 3-6 of these in a grid read as a wall
// of identical boxes (the "blocky" admin complaint this redesign is
// fixing). A tinted background swatch keyed to tone carries the same
// "this needs attention" signal a red border did, but as a single flat
// fill rather than another line competing with every other tile's
// border, and it scales down cleanly to a neutral surface tint when
// tone is 'neutral' instead of rendering an oddly bare, borderless box.
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
  const background = tone === 'ok' ? 'var(--ok-bg)' : tone === 'error' ? 'var(--error-bg)' : 'var(--bg-elevated)';

  return (
    <div className="rounded-md px-4 py-3.5" style={{ background }}>
      <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
        {label}
      </p>
      <p className="font-display mt-1.5 text-3xl leading-none" style={{ color: valueColor }}>
        {value}
      </p>
      {sublabel && (
        <p className="mt-1.5 text-xs leading-snug" style={{ color: 'var(--ink-dim)' }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}
