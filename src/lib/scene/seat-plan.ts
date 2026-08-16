import type { Browser } from 'playwright-core';

// Real per-seat availability (Scene's own `st_name` field, confirmed to
// only ever be one of these three across every real showtime surveyed on
// both branches). `category` is the seat's price/type tier (e.g.
// "Standard", "Premiere", "Deluxe" -- varies per hall, not a fixed set) and
// is only meaningful for real seats, not row labels/gaps.
export type SeatAvailability = 'free' | 'occupied' | 'hold';

export interface Seat {
  appId: string; // e.g. "grid-1-5" -- also the DOM id Scene's own page uses.
  row: number;
  col: number;
  label: string; // Scene's own seat label, e.g. "A5".
  category: string;
  availability: SeatAvailability;
}

export interface SeatPlan {
  seats: Seat[];
  // The real booking page for this showtime, so seat clicks can deep-link
  // back into Scene's own flow -- see the seat-plan investigation notes:
  // pre-selecting seats via a transplanted session was ruled out as too
  // fragile/session-fixation-shaped, so this just opens their real page.
  //
  // Deliberately the /showtime-<id> URL, NOT /booking-<id> -- confirmed
  // live that opening /booking-<id> directly in a fresh browser (no shared
  // state with whatever loaded the seat plan) renders unstyled with a
  // stale "Your Booking Time is Over" message visibly showing, even for a
  // showtime days in the future. /showtime-<id> is the real entry point
  // Scene's own site links to; something in its page load (client JS)
  // properly initializes the booking widget's state before it redirects
  // into /booking-<id> itself, which a direct /booking-<id> visit skips.
  bookingUrl: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// A showtime's booking URL looks like https://<branch>.scenecinemas.com/showtime-<id>.
// The seat-plan XHR is fired from the /booking-<id> page it redirects to,
// keyed by showtime_id + hall_id + a client-JS-generated order_id tied to
// the booking-hold session that page opens -- confirmed in investigation
// that a plain server-side HTTP replay of this exact request chain (same
// cookies, same CSRF token) still comes back with an empty body, so a real
// browser actually executing Scene's own JS is required, not just cookie
// replay.
function parseShowtimeId(showtimeUrl: string): string {
  const match = showtimeUrl.match(/\/showtime-([a-f0-9]+)/i);
  if (!match) throw new Error(`Not a recognized showtime URL: ${showtimeUrl}`);
  return match[1];
}

interface SeatPlanApiRow {
  app_id: string;
  st: string; // "Blank" (aisle/gap) | "SeatRowTitle" (row-letter label) | a category name ("Standard"/"Premiere"/"Deluxe"/...) for a real seat.
  st_name: string; // The real availability signal: "Free" | "Occupied" | "Hold" -- confirmed the only three values across every branch/hall surveyed.
  st_txt: string; // Scene's own seat label ("A5") for real seats; blank or a bare row letter for structural cells.
  app_category_id: string; // Real category id when a seat has a priced category, "" for structural cells -- present regardless of availability (unlike `st`, which is only a real category name on a free seat).
}

// A hall's seat categories (Standard/Premiere/Deluxe/...) are keyed by
// `app_category_id`, a stable id -- but `st` (the human-readable category
// name) is only populated by Scene's own API when a seat is free.
// Occupied/held seats still carry the same `app_category_id`, just with no
// name attached, so their category would otherwise be lost. Backfilled
// from whatever free seat in the same response shares that id, so an
// occupied Premiere seat still renders as Premiere-colored, not blank.
function buildCategoryNamesById(rows: SeatPlanApiRow[]): Map<string, string> {
  const namesById = new Map<string, string>();
  for (const row of rows) {
    if (row.app_category_id && row.st && !namesById.has(row.app_category_id)) {
      namesById.set(row.app_category_id, row.st);
    }
  }
  return namesById;
}

const AVAILABILITY_BY_ST_NAME: Record<string, SeatAvailability> = {
  Free: 'free',
  Occupied: 'occupied',
  Hold: 'hold',
};

// A cell is a real, bookable seat only if it carries a real seat label
// (Scene's own "A5"-shaped st_txt) -- "Blank" (aisles/gaps) and
// "SeatRowTitle" (the row-letter header cell) both report st_name "Free"
// too but have no real seat label, so filtering on st_name alone would
// wrongly include them.
const REAL_SEAT_LABEL = /^[A-Z]+\d+$/;

function parseGridPosition(appId: string): { row: number; col: number } | null {
  const match = appId.match(/^grid-(\d+)-(\d+)$/);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

// Drives the real showtime -> booking -> seat-plan flow in a caller-supplied
// browser (so the caller decides local full Playwright vs. Vercel's
// playwright-core + @sparticuz/chromium-min) and returns the parsed grid.
// One page load, no polling -- the seat-plan XHR fires automatically as
// part of loading the showtime page itself (its own JS internally opens
// the /booking-<id> booking-hold session and fires the seat-plan POST, all
// within that single navigation -- confirmed by tracing the real request
// sequence live; a second explicit goto() to /booking-<id> reloads the page
// from scratch and actually breaks it, throwing "jQuery is not defined"
// since that fresh load races the script tags that define it).
export async function fetchSeatPlan(browser: Browser, showtimeUrl: string): Promise<SeatPlan> {
  const showtimeId = parseShowtimeId(showtimeUrl);

  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'en-US' });
  const page = await context.newPage();

  try {
    const seatPlanResponse = page.waitForResponse(
      (res) => res.url().includes('/seat-plan') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );

    await page.goto(showtimeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const res = await seatPlanResponse;
    const body = (await res.json()) as { status: number; data: SeatPlanApiRow[] };

    if (body.status !== 1 || !Array.isArray(body.data)) {
      throw new Error(`Unexpected seat-plan response shape for showtime ${showtimeId}`);
    }

    const categoryNamesById = buildCategoryNamesById(body.data);

    const seats: Seat[] = [];
    for (const row of body.data) {
      if (!REAL_SEAT_LABEL.test(row.st_txt)) continue; // Row-title/aisle/gap cell, not a real seat.
      const pos = parseGridPosition(row.app_id);
      if (!pos) continue;
      const availability = AVAILABILITY_BY_ST_NAME[row.st_name];
      if (!availability) continue; // Unrecognized state -- skip rather than guess.

      // Only ever a real category name -- never row.st's raw value as a
      // fallback, since for an occupied/held seat with no app_category_id
      // (confirmed real on live data: occupied seats often carry ""),
      // row.st is "Occupied"/"Hold" itself, not a seat-type name, and
      // would otherwise leak into the category legend as a fake category.
      const category = categoryNamesById.get(row.app_category_id) ?? (availability === 'free' ? row.st : '');

      seats.push({
        appId: row.app_id,
        row: pos.row,
        col: pos.col,
        label: row.st_txt,
        category,
        availability,
      });
    }

    return { seats, bookingUrl: showtimeUrl };
  } finally {
    await context.close();
  }
}
