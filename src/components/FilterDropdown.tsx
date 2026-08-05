'use client';

import { useEffect, useRef, useState } from 'react';

export type StatusFilter = 'all' | 'bookable' | 'coming_soon';

const OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All movies' },
  { value: 'bookable', label: 'Bookable now' },
  { value: 'coming_soon', label: 'Listed, coming soon' },
];

export function FilterDropdown({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function select(next: StatusFilter) {
    setOpen(false);
    onChange(next);
  }

  const currentLabel = OPTIONS.find((o) => o.value === value)?.label ?? 'All movies';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-80"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
      >
        <FilterIcon />
        {currentLabel}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full right-0 z-10 mt-1 w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-sm border shadow-md"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
        >
          {OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => select(option.value)}
                className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                style={{
                  color: 'var(--ink)',
                  background: value === option.value ? 'var(--listed-bg)' : 'transparent',
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3h12M4.5 8h7M7 13h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
