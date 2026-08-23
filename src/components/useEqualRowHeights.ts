'use client';

import { useEffect, useRef } from 'react';

// Matches every card's text-content block height to the tallest one in
// its own visual row, so a row mixing a 1-line and a 2-line title still
// lines up evenly at the bottom -- without reserving fixed space for a
// hypothetical 2nd line on every card (that recreates dead space on
// every short-titled card instead of just the mismatch this fixes).
// Grouping by row can't be computed once: the grid's column count
// changes per breakpoint (grid-cols-2 through grid-cols-6), so which
// cards share a row shifts on resize -- re-measured via ResizeObserver
// on the grid container rather than a one-time effect. Cards are
// grouped into rows by comparing offsetTop (DOM order + CSS Grid's own
// row placement, not an assumed column count), so this stays correct
// regardless of which breakpoint is active.
//
// Target elements are found via a data attribute rather than a ref per
// card, since the number of cards is dynamic (search/filter/"load
// more") and threading a ref into each one would mean re-registering a
// ResizeObserver target per card on every filter change.
export function useEqualRowHeights<T extends HTMLElement>(dataAttr: string, deps: unknown[]) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const targets = Array.from(
        container!.querySelectorAll<HTMLElement>(`[${dataAttr}]`),
      );
      if (targets.length === 0) return;

      // Reset before measuring, so a previous pass's applied height
      // doesn't itself influence this pass's natural-height reading.
      for (const el of targets) el.style.minHeight = '';

      const rows = new Map<number, HTMLElement[]>();
      for (const el of targets) {
        const top = el.getBoundingClientRect().top;
        // Group by rounded top position -- exact float equality isn't
        // reliable across elements laid out by the same grid row due to
        // sub-pixel rendering differences.
        const key = Math.round(top);
        const bucket = [...rows.entries()].find(([k]) => Math.abs(k - key) < 2);
        if (bucket) {
          bucket[1].push(el);
        } else {
          rows.set(key, [el]);
        }
      }

      for (const rowEls of rows.values()) {
        const maxHeight = Math.max(...rowEls.map((el) => el.getBoundingClientRect().height));
        for (const el of rowEls) el.style.minHeight = `${maxHeight}px`;
      }
    }

    // Run after layout settles (fonts, images) rather than immediately,
    // and again on any resize of the grid itself (column count changing
    // at a breakpoint, or the window resizing within one breakpoint).
    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
