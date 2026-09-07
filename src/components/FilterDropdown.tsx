'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { useAnimatedOpen } from '@/lib/useAnimatedOpen';

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

  // Keyboard-only users had no way to close this once opened via
  // Enter/Space -- the click-outside listener above only ever fires on a
  // real mouse event. Escape returning focus to the trigger (rather than
  // wherever it happened to land inside the closed menu) matches native
  // <select> behavior.
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

  function select(next: StatusFilter) {
    setOpen(false);
    onChange(next);
  }

  const currentLabel = OPTIONS.find((o) => o.value === value)?.label ?? 'All movies';

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
          className={`absolute top-full right-0 z-10 mt-2 w-52 max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-lg border shadow-lg ${animationClass}`}
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
        >
          {OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => select(option.value)}
                className="block min-h-11 w-full px-4 py-2.5 text-left text-sm transition-[opacity,background-color,color] duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
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
