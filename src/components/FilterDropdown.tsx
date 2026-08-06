'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';

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
        className="flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors hover:opacity-90"
        style={{ background: 'var(--bg-elevated)', color: 'var(--ink)' }}
      >
        {currentLabel}
        <ChevronDownIcon
          size={18}
          style={{ color: 'var(--ink)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full right-0 z-10 mt-2 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
        >
          {OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => select(option.value)}
                className="block min-h-11 w-full px-4 py-2.5 text-left text-sm hover:opacity-80"
                style={{
                  color: value === option.value ? 'var(--accent)' : 'var(--ink)',
                  background: value === option.value ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  fontWeight: value === option.value ? 600 : 400,
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
