'use client';

import { useMemo, useState } from 'react';
import type { Seat } from '@/lib/scene/seat-plan';

// Renders a real Scene Cinemas seat grid fetched via /api/seat-plan, as a
// theater-style curved layout: rows are centered as independent groups
// (not locked to one shared grid of columns), row A (nearest the screen)
// renders first per Scene's own back-to-front row numbering, and each
// row's seats bow slightly toward the screen near the row's edges, so it
// reads as a real auditorium map instead of a flat table.
//
// Selection here is local only (no session/order tied to it) -- clicking
// seats just builds a summary, then "Continue to booking" opens Scene's own
// real showtime page in a new tab for the user to reselect and pay. Scene's
// booking flow has no public URL scheme for pre-selecting seats (confirmed
// live: clicking a seat there fires a request that locks it server-side to
// that page load's own session -- there's no token or URL parameter a
// second, separate browser could reuse), so this intentionally doesn't try
// to hand off a selection -- it keeps the picks visible instead, as a
// reference for what to click on Scene's page.
export function SeatGrid({ seats, bookingUrl }: { seats: Seat[]; bookingUrl: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { rows, categories } = useMemo(() => {
    const byRow = new Map<number, Seat[]>();
    for (const seat of seats) {
      if (!byRow.has(seat.row)) byRow.set(seat.row, []);
      byRow.get(seat.row)!.push(seat);
    }
    // Scene's own numbering runs back-to-front (row 1 = the letter
    // furthest from the screen, e.g. "N"; the highest row number = "A",
    // right under the screen -- confirmed against real seat-plan data).
    // Sort descending so row A renders first/nearest the Screen element,
    // matching the real seating convention.
    //
    // Column direction: confirmed live against Scene's own rendered page
    // (real DOM x-positions cross-checked seat by seat, e.g. grid-12-21 =
    // seat "B24" sits at the LEFT edge of its block, grid-12-18 = "B21" at
    // the RIGHT edge) that grid_col runs right-to-left -- ascending col
    // means moving LEFT on screen, the opposite of the natural assumption.
    // Sort descending so ascending column numbers still render right of
    // where lower numbers land, matching Scene's real layout.
    const sortedRows = [...byRow.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, rowSeats]) => rowSeats.sort((a, b) => b.col - a.col));

    const seenCategories = new Set<string>();
    for (const s of seats) {
      if (s.category) seenCategories.add(s.category);
    }

    return { rows: sortedRows, categories: [...seenCategories] };
  }, [seats]);

  function toggleSeat(seat: Seat) {
    if (seat.availability !== 'free') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.appId)) next.delete(seat.appId);
      else next.add(seat.appId);
      return next;
    });
  }

  const selectedSeats = seats.filter((s) => selected.has(s.appId));

  if (seats.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
        No seat map available for this showtime yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Screen />

      <div className="scrollbar-none overflow-x-auto pb-2">
        {/* Row labels sit outside the centered column (absolutely
            positioned, not sharing flex flow with the seats) so a row's
            seats always center on the same axis regardless of whether that
            row is 8 seats or 22 -- the label used to sit inline before the
            seats, which shifted each row's true center off-axis by however
            wide the label was, since only the label side had that extra
            space. */}
        <div className="mx-auto flex w-fit flex-col items-center gap-2 py-1 pr-2 pl-6">
          {rows.map((rowSeats, i) => {
            const rowLabel = rowLetterFor(rowSeats);
            const seatCount = rowSeats.length;
            const rowCenter = (seatCount - 1) / 2;

            return (
              <div key={i} className="relative flex items-center">
                <span
                  className="absolute right-full mr-2 text-[10px] font-semibold tabular-nums"
                  style={{ color: 'var(--ink-dim)' }}
                >
                  {rowLabel}
                </span>
                <div className="flex gap-1.5">
                  {rowSeats.map((seat, seatIdx) => {
                    const isSelected = selected.has(seat.appId);
                    // Real theater curvature: seats bow slightly toward the
                    // screen as they approach the row's edges (a fixed
                    // parabola across seat position, not tied to
                    // row-to-row distance) -- rows near the front curve a
                    // little more than rows near the back, like a real
                    // raked/curved auditorium.
                    const distanceFromRowCenter = rowCenter > 0 ? Math.abs(seatIdx - rowCenter) / rowCenter : 0;
                    const curveStrength = 1 - i / Math.max(1, rows.length - 1);
                    const liftPx = distanceFromRowCenter ** 2 * 8 * curveStrength;

                    return (
                      <button
                        key={seat.appId}
                        type="button"
                        title={`${seat.label}${seat.category ? ` · ${seat.category}` : ''}`}
                        disabled={seat.availability !== 'free'}
                        onClick={() => toggleSeat(seat)}
                        className="relative h-6 w-6 shrink-0 rounded-t-md rounded-b-[3px] text-[9px] leading-6 font-medium transition-transform disabled:cursor-not-allowed active:scale-90 enabled:hover:scale-110"
                        style={{ transform: `translateY(${liftPx}px)`, ...seatStyle(seat, isSelected) }}
                      >
                        {isSelected ? '✓' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Legend categories={categories} />

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--rule)' }}>
        <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
          {selectedSeats.length === 0
            ? 'Tap seats to plan your pick, then continue to Scene Cinemas to book.'
            : `Your picks: ${selectedSeats.map((s) => s.label).join(', ')} — look for these on Scene's page.`}
        </p>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block shrink-0 rounded-sm px-4 py-2 text-center text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Continue to booking
        </a>
      </div>
    </div>
  );
}

function rowLetterFor(rowSeats: Seat[]): string {
  const match = rowSeats[0]?.label.match(/^[A-Z]+/);
  return match ? match[0] : '';
}

function Screen() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-1">
      <div
        className="h-1.5 w-full rounded-t-full"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
          boxShadow: '0 4px 24px -4px var(--accent)',
        }}
      />
      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
        Screen
      </span>
    </div>
  );
}

function Legend({ categories }: { categories: string[] }) {
  return (
    <div className="flex flex-col gap-2 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 xs:flex xs:flex-wrap xs:items-center xs:gap-x-4">
        <LegendItem swatch={seatStyle({ availability: 'free', category: '' } as Seat, false)} label="Available" />
        <LegendItem swatch={seatStyle({ availability: 'free', category: '' } as Seat, true)} label="Selected" />
        <LegendItem swatch={seatStyle({ availability: 'occupied', category: '' } as Seat, false)} label="Taken" />
        <LegendItem swatch={seatStyle({ availability: 'hold', category: '' } as Seat, false)} label="On hold" />
      </div>
      {categories.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2" style={{ borderColor: 'var(--rule)' }}>
          {categories.map((category) => (
            <LegendItem
              key={category}
              swatch={seatStyle({ availability: 'free', category } as Seat, false)}
              label={category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-[3px]" style={swatch} />
      {label}
    </span>
  );
}

// Availability carries the dominant color signal (it's what actually
// matters for booking); category rides along as a border treatment on top
// rather than a second competing hue family -- this app's palette is a
// tight teal/status system (see globals.css), and most halls only ever
// have 1-3 categories, so a border variant reads clearly without
// introducing an unrelated categorical ramp.
function seatStyle(seat: Pick<Seat, 'availability' | 'category'>, isSelected: boolean): React.CSSProperties {
  const base: React.CSSProperties = { transition: 'transform 0.1s ease' };

  if (isSelected) {
    return { ...base, background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 2px 8px -1px var(--accent)' };
  }
  if (seat.availability === 'occupied') {
    return { ...base, background: 'var(--error-bg)', color: 'var(--error-ink)', opacity: 0.6 };
  }
  if (seat.availability === 'hold') {
    return { ...base, background: 'var(--listed-bg)', color: 'var(--listed-ink)', opacity: 0.7 };
  }

  const category = seat.category?.toLowerCase() ?? '';
  if (category.includes('premiere') || category.includes('vip')) {
    return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)', boxShadow: 'inset 0 0 0 1.5px var(--ok-ink)' };
  }
  if (category.includes('deluxe')) {
    return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)', boxShadow: 'inset 0 0 0 1.5px var(--accent-dim)' };
  }
  return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)' };
}
