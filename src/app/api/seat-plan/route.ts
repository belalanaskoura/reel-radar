import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { launchBrowser } from '@/lib/scene/browser';
import { fetchSeatPlan } from '@/lib/scene/seat-plan';
import { getScenePriceTemplate, matchPriceForCategory } from '@/lib/scene/price-template';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { checkRateLimit } from '@/lib/rate-limit';

// Hobby's default function timeout is 10s; a full booking-hold browser
// flow (page load + redirect + waiting for the seat-plan XHR) ran close to
// that in testing, so this asks for the max Hobby allows.
export const maxDuration = 60;

// On-demand, per-page-view seat grid fetch -- not cached like showtimes_cache,
// since seat availability is meaningfully time-sensitive and this is a real
// browser-driven request already (see seat-plan.ts's comment on why a plain
// HTTP scrape can't get this data at all). Gated to signed-in users only,
// same requireUserId pattern as watchlist/actions.ts, since this is a much
// heavier request than any other user-triggered route in the app.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The most expensive endpoint in this app by a wide margin: every call
  // launches a real Chromium and drives a live booking flow against
  // Scene, with a 60s ceiling. "Signed in" was the only gate, which meant
  // one account could exhaust the whole function budget in a loop and
  // point sustained browser automation at a third party from our IP.
  // Keyed per user, deliberately tight -- a person opening seat maps
  // hits this a handful of times in a session, not thirty.
  if (!(await checkRateLimit(`seat-plan:user:${user.id}`, 15, 3600))) {
    return NextResponse.json(
      { error: 'Too many seat map requests. Try again later.' },
      { status: 429 },
    );
  }

  const { showtimeUrl, branchId } = (await request.json()) as {
    showtimeUrl?: string;
    branchId?: string;
  };
  if (!showtimeUrl || typeof showtimeUrl !== 'string') {
    return NextResponse.json({ error: 'Missing showtimeUrl' }, { status: 400 });
  }

  const branchBaseUrls = BRANCH_BASE_URLS as Record<BranchId, string>;
  const allowedHosts = Object.values(branchBaseUrls).map((base) => new URL(base).hostname);
  let parsed: URL;
  try {
    parsed = new URL(showtimeUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid showtimeUrl' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname) || !/^\/showtime-[a-f0-9]+$/i.test(parsed.pathname)) {
    return NextResponse.json({ error: 'showtimeUrl is not a recognized Scene showtime URL' }, { status: 400 });
  }
  // branchId is only used to key the price template lookup below (a cheap
  // display nicety) -- an unrecognized/missing value just means no prices
  // get attached, never a hard failure, since showtimeUrl's own host
  // validation above is what actually gates which site gets scraped.
  const resolvedBranchId =
    branchId && branchId in branchBaseUrls ? (branchId as BranchId) : null;

  const browser = await launchBrowser();
  try {
    const [seatPlan, priceTemplate] = await Promise.all([
      fetchSeatPlan(browser, showtimeUrl),
      resolvedBranchId ? getScenePriceTemplate(supabase) : Promise.resolve([]),
    ]);

    const seats = resolvedBranchId
      ? seatPlan.seats.map((seat) => ({
          ...seat,
          priceEgp: matchPriceForCategory(priceTemplate, resolvedBranchId, seat.category),
        }))
      : seatPlan.seats;

    return NextResponse.json({ ...seatPlan, seats });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch seat plan' },
      { status: 502 },
    );
  } finally {
    await browser.close();
  }
}
