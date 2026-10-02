'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { useAnimatedOpen } from '@/lib/useAnimatedOpen';

export function FormatFilterDropdown({
  formats,
  value,
  onChange,
}: {
  formats: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function select(next: string | null) {
    setOpen(false);
    onChange(next);
  }

  const currentLabel = value ?? 'All experiences';

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
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
          // max-h + overflow-y-auto (not just overflow-hidden, which
          // CinemaFilterDropdown gets away with since its list is always
          // a handful of branches) -- formats is scraped, free-form text
          // with no fixed count, so a long list on a short phone viewport
          // needs to scroll internally rather than run off the bottom of
          // the screen with no way to reach the cut-off options.
          className={`absolute top-full right-0 z-10 mt-2 max-h-72 w-52 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto rounded-lg border shadow-lg ${animationClass}`}
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => select(null)}
              className="block min-h-11 w-full px-4 py-2.5 text-left text-sm hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{
                color: value === null ? 'var(--accent)' : 'var(--ink)',
                background: value === null ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                fontWeight: value === null ? 600 : 400,
              }}
            >
              All experiences
            </button>
          </li>
          {formats.map((format) => (
            <li key={format}>
              <button
                type="button"
                role="option"
                aria-selected={value === format}
                onClick={() => select(format)}
                className="block min-h-11 w-full px-4 py-2.5 text-left text-sm transition-[opacity,background-color,color] duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                style={{
                  color: value === format ? 'var(--accent)' : 'var(--ink)',
                  background: value === format ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  fontWeight: value === format ? 600 : 400,
                }}
              >
                {format}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
