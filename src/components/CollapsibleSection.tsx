'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from '@/components/icons';

// A tighter, borderless sibling to SettingsCard for a single standalone
// collapsible block (e.g. /watchlist's "Tracked cinemas") -- SettingsCard's
// own border-b + py-4 are built for a stacked list of rows sharing one
// running divider, and read as unwanted empty space above/below when
// there's only one of it on a page with no adjacent rows to visually
// connect to.
export function CollapsibleSection({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) setHeight(el.scrollHeight);
  }, []);

  function toggle() {
    if (!open && contentRef.current) setHeight(contentRef.current.scrollHeight);
    setOpen((o) => !o);
  }

  return (
    <div className="rounded-lg" style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-opacity hover:opacity-80"
      >
        {icon && (
          <div className="flex shrink-0 items-center" style={{ color: 'var(--accent)' }}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base leading-none tracking-wide" style={{ color: 'var(--ink)' }}>
            {title}
          </h2>
          {description && (
            <p className="mt-1 truncate text-xs" style={{ color: 'var(--ink-dim)' }}>
              {description}
            </p>
          )}
        </div>
        <ChevronDownIcon
          size={16}
          className="shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]"
          style={{ color: 'var(--ink-dim)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      <div
        className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={{ height: open ? height : 0 }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
