'use client';

import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { TicketIcon } from '@/components/icons';
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
// to hand off a selection. Instead, the picks stay visible in a persistent
// bottom bar the whole time the user scrolls the grid -- deliberately
// mirroring Scene's own "Choose Seats" page, which keeps its own selection
// count + Checkout button pinned in a header bar throughout -- not a
// pixel-for-pixel copy, adapted to this app's own dark teal system.
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

    // Price rides along with category rather than as a separate lookup:
    // every seat sharing a category name carries the same priceEgp (set
    // once per branch/category by the API route from the admin-maintained
    // template, see src/lib/scene/price-template.ts), so the first seat
    // seen for a category is a safe representative for the legend.
    const categoryPrices = new Map<string, number | null>();
    for (const s of seats) {
      if (s.category && !categoryPrices.has(s.category)) categoryPrices.set(s.category, s.priceEgp);
    }

    return { rows: sortedRows, categories: [...categoryPrices.entries()] };
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
    <div className="flex flex-col gap-6">
      <Screen />

      <div className="scrollbar-none overflow-x-auto pb-2">
        {/* Row labels sit outside the centered column (absolutely
            positioned, not sharing flex flow with the seats) so a row's
            seats always center on the same axis regardless of whether that
            row is 8 seats or 22 -- the label used to sit inline before the
            seats, which shifted each row's true center off-axis by however
            wide the label was, since only the label side had that extra
            space. */}
        <div className="mx-auto flex w-fit flex-col items-center gap-2.5 py-1 pr-2 pl-6">
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
                <div className="flex gap-1">
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
                      <SeatButton
                        key={seat.appId}
                        seat={seat}
                        isSelected={isSelected}
                        liftPx={liftPx}
                        onToggle={() => toggleSeat(seat)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Legend categories={categories} />

      {/* Spacer so the sticky bar below never covers the legend/last row --
          height matches the bar's own real height (measured: ~88px with
          seats selected, ~72px empty; 96px covers both with margin). */}
      <div className="h-24" aria-hidden="true" />

      <SelectionBar selectedSeats={selectedSeats} bookingUrl={bookingUrl} />
    </div>
  );
}

function SeatButton({
  seat,
  isSelected,
  liftPx,
  onToggle,
}: {
  seat: Seat;
  isSelected: boolean;
  liftPx: number;
  onToggle: () => void;
}) {
  return (
    // The visual seat stays a compact 24px (a real hall row can be 25+
    // seats wide -- 44px marks would force far more horizontal scrolling
    // than the tap-forgiveness is worth), but the actual tappable area
    // is padded out toward the 44px touch-target minimum by wrapping it
    // in a larger invisible hit box, matching Scene's own row-tight
    // layout while still meeting the real minimum.
    <span
      className="-m-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center"
      style={{ transform: `translateY(${liftPx}px)` }}
    >
      <button
        type="button"
        title={`${seat.label}${seat.category ? ` · ${seat.category}` : ''}`}
        disabled={seat.availability !== 'free'}
        onClick={onToggle}
        className="relative h-6 w-6 shrink-0 rounded-t-md rounded-b-[3px] text-[9px] leading-6 font-medium disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:scale-105 enabled:active:scale-90"
        style={seatStyle(seat, isSelected)}
      >
        {isSelected && (
          <svg
            className="animate-seat-pop absolute inset-0 m-auto h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    </span>
  );
}

// Persistent bottom bar -- always visible while the (potentially very
// tall, 20+ row) grid scrolls, rather than a summary line buried at the
// bottom of the page a user would have to scroll all the way down to see.
// Mirrors Scene's own "Choose Seats" page, which keeps its seat count +
// Checkout button pinned in view throughout, not a one-time footer.
function SelectionBar({ selectedSeats, bookingUrl }: { selectedSeats: Seat[]; bookingUrl: string }) {
  const hasSelection = selectedSeats.length > 0;
  // Only shown once every selected seat has a known template price --
  // a partial total (e.g. 2 of 3 seats priced) would understate the real
  // cost, worse than not showing a number at all.
  const allPriced = hasSelection && selectedSeats.every((s) => s.priceEgp != null);
  const totalEgp = allPriced ? selectedSeats.reduce((sum, s) => sum + (s.priceEgp ?? 0), 0) : null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md"
      style={{
        borderColor: 'var(--rule)',
        background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200"
            style={{
              background: hasSelection ? 'var(--accent)' : 'var(--bg-elevated)',
              color: hasSelection ? 'var(--accent-ink)' : 'var(--ink-dim)',
            }}
          >
            <TicketIcon size={16} />
          </span>
          <div className="min-w-0 flex-col leading-tight">
            {/* Keyed by the visible string so each change to the seat
                count/total remounts and cross-fades instead of swapping
                instantly -- the sticky bar's icon badge already had a
                color transition on this same state change, but the text
                itself popped with zero motion. */}
            <p
              key={selectedSeats.length}
              className="animate-fade-in text-sm font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              {hasSelection
                ? `${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'} selected${totalEgp != null ? ` · ${totalEgp} EGP` : ''}`
                : 'No seats selected'}
            </p>
            <p
              key={selectedSeats.map((s) => s.appId).join(',')}
              className="animate-fade-in truncate text-xs"
              style={{ color: 'var(--ink-dim)' }}
            >
              {hasSelection
                ? selectedSeats.map((s) => s.label).join(', ')
                : 'Tap seats above to plan your pick'}
            </p>
          </div>
        </div>

        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block shrink-0 rounded-sm px-4 py-2.5 text-center text-sm font-medium whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Continue to booking
        </a>
      </div>
    </div>
  );
}

// Echoes SeatGrid's real curved-row shape (same row-count taper, same
// Screen element) while /api/seat-plan's real headless-browser fetch is
// still in flight -- that request routinely takes 10-20s+ (cold Chromium
// launch + live third-party page load, not a cache read), long enough that
// a bare spinner reads as stalled well before it resolves.
//
// Rows are drawn as real X/gap patterns rather than solid tapering blocks:
// pulled two live halls' actual seat-plan responses (cfc's "The End of Oak
// Street" and district5's "The Odyssey") and both showed the same real
// structure -- three seat blocks per row separated by two aisle gaps, a
// short single-block row near the middle (Scene's own row H, 5-8 seats),
// and the two side blocks narrowing on rows further from the screen. A
// solid uniform-taper skeleton (the previous version) read as visibly
// fake next to that -- no aisles, no row-to-row shape variation -- so the
// jump to real data was jarring. `X` = a seat skeleton cell, `.` = a real
// gap (rendered as empty space, not a dimmed seat).
const ROW_PATTERNS = [
  'XXXX..XXXXXX..XXXX',
  'XXXX..XXXXXX..XXXX',
  'XXXXX..XXXXXX..XXXXX',
  'XXXXX..XXXXXX..XXXXX',
  'XXXXX..XXXXXX..XXXXX',
  'XXXXX..XXXXXX..XXXXX',
  'XXXXX..XXXXXX..XXXXX',
  '.....XXXXXXXX.....', // Scene's own short center-only row (its real row H).
  'XXX..XXXXXXXX..XXX',
  'XXX..XXXXXXXX..XXX',
  'XXXXXX..XXXXXXXX..XXXXXX',
  'XXXXXX..XXXXXXXX..XXXXXX',
  'XXXXXXX..XXXXXXXX..XXXXXXX',
];

export function SeatGridSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Screen />
      <div className="mx-auto flex w-fit flex-col items-center gap-2.5 py-1 pr-2 pl-6">
        {ROW_PATTERNS.map((pattern, i) => (
          <div key={i} className="flex gap-1">
            {pattern.split('').map((cell, j) =>
              cell === 'X' ? (
                <Skeleton key={j} className="h-6 w-6 shrink-0 rounded-t-md rounded-b-[3px]" />
              ) : (
                <div key={j} className="h-6 w-6 shrink-0" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
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
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-1.5">
      <div
        className="animate-screen-glow h-1.5 w-full rounded-t-full"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        }}
      />
      <span className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--ink-dim)' }}>
        Screen
      </span>
    </div>
  );
}

function Legend({ categories }: { categories: [string, number | null][] }) {
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
          {categories.map(([category, priceEgp]) => (
            <LegendItem
              key={category}
              swatch={seatStyle({ availability: 'free', category } as Seat, false)}
              label={priceEgp != null ? `${category} · ${priceEgp} EGP` : category}
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
  // Single source of truth for the seat's transition (previously also
  // duplicated as a Tailwind transition-transform class on the button
  // itself, which fought with this inline style for the same property --
  // inline style always won, so the className's declared duration/easing
  // was silently dead). emil-design-eng's strong ease-out curve, in the
  // 100-160ms press-feedback band.
  const base: React.CSSProperties = { transition: 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1)' };

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
