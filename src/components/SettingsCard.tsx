'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';

// Collapsible settings row: closed by default, a plain header (no
// border/fill) until tapped, expanding in place to reveal its content in
// a bordered panel. Replaces the earlier always-open bordered card for
// every section on /account/edit -- with five-plus of those stacked
// vertically the page read as a wall of filled boxes; collapsed rows let
// only the section someone's actually adjusting take up that visual
// weight.
//
// Animates a real measured pixel height, not `grid-template-rows: 0fr/1fr`
// (an earlier version of this component). That fr-unit trick is
// technically animatable but browsers don't interpolate it as smoothly as
// a real height -- it read as an abrupt snap rather than a genuine ease,
// especially for taller sections like Identity or Cinema Alerts. A
// ResizeObserver keeps the measured height correct if the content's own
// height changes while open (e.g. CinemaAlertsCard's branch grid), not
// just at the moment of toggling.
export function SettingsCard({
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
  // apple-design §14: reduced motion means a gentler equivalent, not zero
  // feedback -- so this collapses straight to open/closed with a quick
  // opacity-only cross-fade instead of the height slide + translateY
  // choreography below.
  const reducedMotion = useReducedMotion();

  // Measures synchronously before paint so a defaultOpen card renders at
  // its real height on first frame instead of starting from 0 and
  // visibly animating open on load.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) setHeight(el.scrollHeight);
  }, []);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || !open) return;

    const observer = new ResizeObserver(() => setHeight(el.scrollHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  function toggle() {
    // Re-measure right before opening so height reflects any content
    // that changed while collapsed (e.g. a value loaded async), rather
    // than animating to a stale number from mount.
    if (!open && contentRef.current) setHeight(contentRef.current.scrollHeight);
    setOpen((o) => !o);
  }

  return (
    <div className="border-b" style={{ borderColor: 'var(--rule)' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-4 text-left transition-[opacity,transform] duration-150 ease-out hover:opacity-80 active:scale-[0.99]"
      >
        {icon && (
          <div className="shrink-0" style={{ color: 'var(--accent)' }}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-none tracking-wide" style={{ color: 'var(--ink)' }}>
            {title}
          </h2>
          {description && (
            <p className="mt-1 truncate text-xs" style={{ color: 'var(--ink-dim)' }}>
              {description}
            </p>
          )}
        </div>
        <ChevronDownIcon
          size={18}
          className={`shrink-0 ${reducedMotion ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]'}`}
          style={{ color: 'var(--ink-dim)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      <div
        className={`overflow-hidden ${reducedMotion ? 'transition-[height] duration-100 ease-out' : 'transition-[height] duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]'}`}
        style={{ height: open ? height : 0 }}
      >
        <div
          ref={contentRef}
          className={`pb-5 ${reducedMotion ? 'transition-opacity duration-100 ease-out' : 'transition-[opacity,transform] duration-200 ease-out'}`}
          style={{
            opacity: open ? 1 : 0,
            transform: reducedMotion ? undefined : open ? 'translateY(0)' : 'translateY(-4px)',
            transitionDelay: reducedMotion ? '0ms' : open ? '100ms' : '0ms',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
