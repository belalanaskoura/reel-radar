// Every admin page repeated the same "text-xs font-semibold tracking-
// widest uppercase" <h2> inline, sometimes with a trailing control (the
// scrapers page's branch filter, broadcast's recipient count) crammed in
// a manually-built flex row. Centralized so that layout is consistent and
// each page only says what the label/action actually is.
export function SectionHeader({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
        {children}
      </h2>
      {action}
    </div>
  );
}
