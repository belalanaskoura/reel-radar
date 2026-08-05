'use client';

export type SortDirection = 'asc' | 'desc';

// Simple two-state toggle -- a full dropdown (like FilterDropdown) would
// be overkill for a binary choice; this just swaps the arrow icon and
// label on click.
export function SortToggle({
  value,
  onChange,
}: {
  value: SortDirection;
  onChange: (value: SortDirection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === 'asc' ? 'desc' : 'asc')}
      className="flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-80"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
    >
      <SortIcon direction={value} />
      {value === 'asc' ? 'Soonest first' : 'Latest first'}
    </button>
  );
}

function SortIcon({ direction }: { direction: SortDirection }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: direction === 'desc' ? 'scaleY(-1)' : undefined }}
    >
      <path d="M3 6h12M3 12h8M3 18h4" />
      <path d="M18 8v12" />
      <path d="M14 16l4 4 4-4" />
    </svg>
  );
}
