'use client';

import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { TicketIcon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
export function SeatGrid({
  seats,
  bookingUrl,
  branchName,
}: {
  seats: Seat[];
  bookingUrl: string;
  // The specific Scene branch this showtime belongs to (e.g. "Cairo
  // Festival City"), not a hardcoded chain name -- more branches may be
  // added later, and the leave-confirmation dialog below should always
  // name the real one the user is actually headed to. VOX has no seat-
  // level booking flow (its own showtime picker links straight to VOX's
  // general showtimes page, never a seat grid), so SeatGrid itself stays
  // Scene-only regardless of how many Scene branches exist.
  branchName: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { rows, categories, cheapestPriceEgp } = useMemo(() => {
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
      .map(([, rowSeats]) => {
        const sorted = rowSeats.sort((a, b) => b.col - a.col);
        // Real aisle width between two consecutive seats, derived from
        // the actual gap in Scene's own column numbers -- fetchSeatPlan
        // only ever returns real, bookable seats (Blank/SeatRowTitle
        // cells are dropped before this point), so a jump of e.g. 4
        // between col 13 and col 9 means 3 real Blank columns sit between
        // them. Confirmed live against a real hall (CFC's Resident Evil
        // 4DX showtime): aisle width and position varies per row and
        // isn't symmetric (one row had gaps of 1, 3, and 1 columns at
        // three different points), so this can't be a fixed pattern --
        // it has to come from the real per-seat column numbers.
        const withGaps = sorted.map((seat, idx) => ({
          seat,
          gapBefore: idx === 0 ? 0 : Math.abs(sorted[idx - 1].col - seat.col) - 1,
        }));
        return withGaps;
      });

    // Price rides along with category rather than as a separate lookup:
    // every seat sharing a category name carries the same priceEgp (set
    // once per branch/category by the API route from the admin-maintained
    // template, see src/lib/scene/price-template.ts), so the first seat
    // seen for a category is a safe representative for the legend.
    const categoryPrices = new Map<string, number | null>();
    for (const s of seats) {
      if (s.category && !categoryPrices.has(s.category)) categoryPrices.set(s.category, s.priceEgp);
    }

    // The hall's cheapest real, priced category -- used to rank every
    // other category as "premium" (priced above it) rather than matching
    // specific format names. Category names are genuinely open-ended
    // (confirmed live: "4DX" alongside "Standard"/"Premiere"/"Deluxe"/
    // "ScreenX" across different halls), so a hardcoded keyword list
    // always lags whatever format Scene adds next -- this scales to any
    // name using data already attached to each seat. Null (no price
    // template on file for this branch yet) means there's no ranking
    // signal at all, not that every category is equally cheap.
    const pricedValues = [...categoryPrices.values()].filter((p): p is number => p != null);
    const cheapestPriceEgp = pricedValues.length > 0 ? Math.min(...pricedValues) : null;

    return { rows: sortedRows, categories: [...categoryPrices.entries()], cheapestPriceEgp };
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

  // Scene's own "Choose Seats" page can't receive a picked selection from
  // here (confirmed live: seat locking is tied server-side to the exact
  // browser session that clicked it -- there's no URL param or token a
  // separate session could reuse, and browsers block a script from one
  // site touching another site's page regardless), so the user still has
  // to click the same seats there by hand. This dialog is the one thing
  // that CAN happen on our own side of that handoff: a clear last look at
  // exactly what was picked, right as they're about to leave for Scene's
  // site, so it's freshly in mind instead of something to scroll back up
  // and re-read. Not a yes/no decision -- the only action is acknowledging
  // and continuing, since "Continue to booking" already meant they're
  // ready to go.
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  function handleContinueClick(e: React.MouseEvent) {
    if (selectedSeats.length === 0) return;
    e.preventDefault();
    setShowLeaveConfirm(true);
  }

  function confirmLeave() {
    setShowLeaveConfirm(false);
    window.open(bookingUrl, '_blank', 'noopener,noreferrer');
  }

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
        <div className="mx-auto flex w-fit flex-col items-center gap-1.5 py-1 pr-2 pl-6">
          {rows.map((rowSeats, i) => {
            const rowLabel = rowLetterFor(rowSeats);

            return (
              <div key={i} className="relative flex items-center">
                <span
                  className="absolute right-full mr-2 text-[10px] font-semibold tabular-nums"
                  style={{ color: 'var(--ink-dim)' }}
                >
                  {rowLabel}
                </span>
                {/* No shared flex `gap` here -- each seat's own leading
                    space is rendered explicitly below (one 22px "seat
                    pitch" per real Blank column Scene reports before it,
                    same pitch a normally-adjacent pair already renders at
                    via SeatButton's own 20px width + this row's 2px
                    baseline), since a uniform gap can't represent Scene's
                    actual (asymmetric, per-row) aisle layout. Flat, no
                    per-seat curve/lift -- confirmed against Scene's own
                    "Choose Seats" page that its real grid is flat, not
                    bowed; the earlier curve effect was a stylistic guess
                    this app added, not something Scene's layout has. */}
                <div className="flex">
                  {rowSeats.map(({ seat, gapBefore }, seatIdx) => {
                    const isSelected = selected.has(seat.appId);
                    // Adjacent seats (gapBefore 0) sit almost touching, a
                    // 1px seam -- confirmed against Scene's own picker
                    // that its real within-block spacing reads as nearly
                    // continuous, closer than this app's earlier 4px gap.
                    // A real aisle (gapBefore > 0) still gets a full seat
                    // pitch per missing column, so the aisle itself stays
                    // clearly wider than the seam between ordinary seats.
                    const marginLeftPx = seatIdx === 0 ? 0 : 1 + gapBefore * 21;

                    return (
                      <span key={seat.appId} style={{ marginLeft: marginLeftPx }}>
                        <SeatButton
                          seat={seat}
                          isSelected={isSelected}
                          cheapestPriceEgp={cheapestPriceEgp}
                          onToggle={() => toggleSeat(seat)}
                        />
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Legend categories={categories} cheapestPriceEgp={cheapestPriceEgp} />

      {/* Spacer so the sticky bar below never covers the legend/last row --
          height matches the bar's own real height (measured: ~88px with
          seats selected, ~72px empty; 96px covers both with margin). */}
      <div className="h-24" aria-hidden="true" />

      <SelectionBar
        selectedSeats={selectedSeats}
        bookingUrl={bookingUrl}
        onContinueClick={handleContinueClick}
      />

      {showLeaveConfirm && (
        <ConfirmDialog
          title={`Heading to ${branchName}`}
          description={`You picked ${selectedSeats.map((s) => s.label).join(', ')} here. Pick the same seats on ${branchName}'s site to finish booking; we can't select them for you there.`}
          confirmLabel={`Continue to ${branchName}`}
          cancelLabel="Stay here"
          onConfirm={confirmLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  );
}

function SeatButton({
  seat,
  isSelected,
  cheapestPriceEgp,
  onToggle,
}: {
  seat: Seat;
  isSelected: boolean;
  cheapestPriceEgp: number | null;
  onToggle: () => void;
}) {
  return (
    // The visual seat is a compact 20px -- tightened from an earlier 24px
    // to match how close together Scene's own "Choose Seats" page packs
    // seats within a block (confirmed side by side against a real
    // screenshot: Scene's seats sit almost touching, this app's read as
    // visibly more spaced out at 24px+4px gaps) -- but the actual
    // tappable area is still padded out to the real 44px touch-target
    // minimum via a larger invisible hit box, so the tighter visual
    // packing doesn't cost real tap accuracy.
    <span className="-m-3 inline-flex h-11 w-11 shrink-0 items-center justify-center">
      <button
        type="button"
        title={`${seat.label}${seat.category ? ` · ${seat.category}` : ''}`}
        disabled={seat.availability !== 'free'}
        onClick={onToggle}
        className="relative h-5 w-5 shrink-0 rounded-t-md rounded-b-[3px] text-[8px] leading-5 font-medium disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:scale-105 enabled:active:scale-90"
        style={seatStyle(seat, isSelected, cheapestPriceEgp)}
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
function SelectionBar({
  selectedSeats,
  bookingUrl,
  onContinueClick,
}: {
  selectedSeats: Seat[];
  bookingUrl: string;
  onContinueClick: (e: React.MouseEvent) => void;
}) {
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
          onClick={onContinueClick}
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
      <div className="mx-auto flex w-fit flex-col items-center gap-1.5 py-1 pr-2 pl-6">
        {ROW_PATTERNS.map((pattern, i) => (
          <div key={i} className="flex gap-0.5">
            {pattern.split('').map((cell, j) =>
              cell === 'X' ? (
                <Skeleton key={j} className="h-5 w-5 shrink-0 rounded-t-md rounded-b-[3px]" />
              ) : (
                <div key={j} className="h-5 w-5 shrink-0" />
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

function rowLetterFor(rowSeats: { seat: Seat }[]): string {
  const match = rowSeats[0]?.seat.label.match(/^[A-Z]+/);
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

function Legend({
  categories,
  cheapestPriceEgp,
}: {
  categories: [string, number | null][];
  cheapestPriceEgp: number | null;
}) {
  return (
    <div className="flex flex-col gap-2 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 xs:flex xs:flex-wrap xs:items-center xs:gap-x-4">
        <LegendItem
          swatch={seatStyle({ availability: 'free', category: '', priceEgp: null }, false, cheapestPriceEgp)}
          label="Available"
        />
        <LegendItem
          swatch={seatStyle({ availability: 'free', category: '', priceEgp: null }, true, cheapestPriceEgp)}
          label="Selected"
        />
        <LegendItem
          swatch={seatStyle({ availability: 'occupied', category: '', priceEgp: null }, false, cheapestPriceEgp)}
          label="Taken"
        />
        <LegendItem
          swatch={seatStyle({ availability: 'hold', category: '', priceEgp: null }, false, cheapestPriceEgp)}
          label="On hold"
        />
      </div>
      {categories.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2" style={{ borderColor: 'var(--rule)' }}>
          {categories.map(([category, priceEgp]) => (
            <LegendItem
              key={category}
              swatch={seatStyle({ availability: 'free', category, priceEgp }, false, cheapestPriceEgp)}
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
function seatStyle(
  seat: Pick<Seat, 'availability' | 'category' | 'priceEgp'>,
  isSelected: boolean,
  cheapestPriceEgp: number | null,
): React.CSSProperties {
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

  // Premium is ranked by price, not by matching specific category names --
  // Scene's real category names are open-ended (confirmed live: "4DX"
  // alongside "Standard"/"Premiere"/"Deluxe"/"ScreenX" across different
  // halls), so a fixed keyword list always misses whatever format Scene
  // adds next (confirmed: "4DX" fell through to the plain look under the
  // old premiere/vip/deluxe-only check). Any category priced above the
  // hall's cheapest gets the same premium border regardless of its name --
  // one premium tier, not a name-keyed ramp, matching this app's
  // deliberately tight status-color palette.
  const isPremium =
    cheapestPriceEgp != null && seat.priceEgp != null && seat.priceEgp > cheapestPriceEgp;
  if (isPremium) {
    return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)', boxShadow: 'inset 0 0 0 1.5px var(--ok-ink)' };
  }

  // No price data at all (template not on file for this branch yet) --
  // fall back to the old keyword hints as a best-effort rather than
  // rendering every category identically.
  if (cheapestPriceEgp == null) {
    const category = seat.category?.toLowerCase() ?? '';
    if (category.includes('premiere') || category.includes('vip')) {
      return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)', boxShadow: 'inset 0 0 0 1.5px var(--ok-ink)' };
    }
    if (category.includes('deluxe')) {
      return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)', boxShadow: 'inset 0 0 0 1.5px var(--accent-dim)' };
    }
  }

  return { ...base, background: 'var(--ok-bg)', color: 'var(--ok-ink)' };
}
