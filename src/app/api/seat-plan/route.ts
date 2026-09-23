import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { launchBrowser } from '@/lib/scene/browser';
import { fetchSeatPlan } from '@/lib/scene/seat-plan';
import { getScenePriceTemplate, matchPriceForCategory } from '@/lib/scene/price-template';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { checkRateLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/analytics';

// Hobby's default function timeout is 10s; a full booking-hold browser
// flow (page load + redirect + waiting for the seat-plan XHR) ran close to
// that in testing, so this asks for the max Hobby allows.
//
// Real production timing (2026-09-23, via the seat_plan_fetch analytics
// event below): a call reporting 18.9s in Vercel's own function log broke
// down as only ~7.3s inside this route's own code (launch+goto+XHR), a
// ~11.6s gap happening BEFORE any of that -- traced to the app running on
// Vercel's default `iad1` (Washington, D.C.) region despite users/Scene
// both being Egypt-based. The rest of the app was moved to `dub1`
// (Dublin, colocated with the Supabase database) the same day, but this
// route was pinned back to `iad1` specifically (see vercel.json's
// `functions` override) once that same-day migration revealed a second,
// more serious issue: Scene Cinemas' Cloudflare returns a hard 403 to
// every request from Vercel's `dub1` IP range (confirmed live, and via
// error_log's showtime-fetch entries spiking with 403s the moment `dub1`
// went live) -- `iad1` was the one already confirmed working before any
// of this, so every Scene-facing route stays there rather than risk
// hitting the same block from a different, unverified region.
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

  // Stage timing, logged regardless of outcome -- added to find out where
  // a reported 10-20s+ production wait actually goes. Real production
  // numbers (2026-09-23) confirmed launchBrowser's own cost (Chromium
  // binary resolve+launch) as the single largest piece of this route's
  // own ~7s, split further below into resolveExecutableMs/launchProcessMs
  // by launchBrowser itself so a slow launch can be attributed to the
  // right cause (binary download vs. process startup) instead of guessed
  // at.
  const totalStart = Date.now();
  const launchStart = Date.now();
  const { browser, timing: launchTiming } = await launchBrowser();
  const launchMs = Date.now() - launchStart;

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

    logEvent({
      type: 'seat_plan_fetch',
      payload: {
        branchId: resolvedBranchId,
        launchMs,
        resolveExecutableMs: launchTiming.resolveExecutableMs,
        launchProcessMs: launchTiming.launchProcessMs,
        gotoMs: seatPlan.timing.gotoMs,
        xhrWaitMs: seatPlan.timing.xhrWaitMs,
        totalMs: Date.now() - totalStart,
        error: null,
      },
    });

    return NextResponse.json({ ...seatPlan, seats });
  } catch (err) {
    logEvent({
      type: 'seat_plan_fetch',
      payload: {
        branchId: resolvedBranchId,
        launchMs,
        resolveExecutableMs: launchTiming.resolveExecutableMs,
        launchProcessMs: launchTiming.launchProcessMs,
        gotoMs: -1,
        xhrWaitMs: -1,
        totalMs: Date.now() - totalStart,
        error: String(err).slice(0, 500),
      },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch seat plan' },
      { status: 502 },
    );
  } finally {
    await browser.close();
  }
}
