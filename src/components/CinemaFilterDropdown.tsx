'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { useAnimatedOpen } from '@/lib/useAnimatedOpen';

export interface CinemaOption {
  id: string;
  name: string;
}

export function CinemaFilterDropdown({
  cinemas,
  value,
  onChange,
}: {
  cinemas: CinemaOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { mounted, animationClass } = useAnimatedOpen(open);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function select(next: string | null) {
    setOpen(false);
    onChange(next);
  }

  const currentLabel = cinemas.find((c) => c.id === value)?.name ?? 'All cinemas';

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
      {mounted && (
        <ul
          role="listbox"
          className={`absolute top-full right-0 z-10 mt-2 w-56 max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-lg border shadow-lg ${animationClass}`}
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => select(null)}
              className="block min-h-11 w-full px-4 py-2.5 text-left text-sm hover:opacity-80"
              style={{
                color: value === null ? 'var(--accent)' : 'var(--ink)',
                background: value === null ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                fontWeight: value === null ? 600 : 400,
              }}
            >
              All cinemas
            </button>
          </li>
          {cinemas.map((cinema) => (
            <li key={cinema.id}>
              <button
                type="button"
                role="option"
                aria-selected={value === cinema.id}
                onClick={() => select(cinema.id)}
                className="block min-h-11 w-full px-4 py-2.5 text-left text-sm transition-[opacity,background-color,color] duration-150 hover:opacity-80"
                style={{
                  color: value === cinema.id ? 'var(--accent)' : 'var(--ink)',
                  background: value === cinema.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  fontWeight: value === cinema.id ? 600 : 400,
                }}
              >
                {cinema.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
