import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { launchBrowser } from '@/lib/scene/browser';
import { fetchDayShowtimes } from '@/lib/scene/fetcher';
import { filterFutureDates } from '@/lib/scene/dates';
import { getScenePriceTemplate, findTemplateRowForFormat, fetchScenePriceForFormat } from '@/lib/scene/price-template';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { logEvent } from '@/lib/analytics';

// Hobby's function timeout ceiling (see /api/seat-plan's own comment) --
// one real showtime-page load + a lock/unlock round trip runs close to
// the seat-plan route's own budget, so this asks for the same max.
export const maxDuration = 60;

// Scheduled (cron-job.org, recommend once daily -- prices don't change
// often, and each run drives a real live booking-hold click against
// Scene's site, not a cheap fetch) spot-check of ONE (branch, format)
// pair per call against the admin-maintained scene_price_templates table
// (see src/lib/scene/price-template.ts's module comment for why the
// template, not a live fetch, is the display source of truth). Scoped to
// one pair per call, not a full sweep, to stay well inside Hobby's
// function timeout and to keep each run's real-booking-widget automation
// blast radius small -- cron-job.org calls this multiple times with
// different ?branch=/?format= to cover every template row over a
// schedule, the same staggered-offset pattern /api/scrape-scene uses.
//
// A mismatch is logged as a price_mismatch data-quality issue (picked up
// by the next admin-digest run) rather than auto-corrected: a live read
// failing or drifting could just as easily mean Scene's booking widget
// changed shape again (confirmed fragile in investigation -- see this
// file's git history) as it could mean a real price change, and only a
// human should decide which.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const branchParam = url.searchParams.get('branch');
  const formatParam = url.searchParams.get('format');
  const branchIds = Object.keys(BRANCH_BASE_URLS) as BranchId[];
  if (!branchParam || !branchIds.includes(branchParam as BranchId)) {
    return NextResponse.json({ error: `Missing/unknown branch: ${branchParam}` }, { status: 400 });
  }
  if (!formatParam) {
    return NextResponse.json({ error: 'Missing format' }, { status: 400 });
  }
  const branchId = branchParam as BranchId;

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  const template = await getScenePriceTemplate(supabase);
  const templateRow = findTemplateRowForFormat(template, branchId, formatParam);
  if (!templateRow) {
    return NextResponse.json(
      { error: `No template row for ${branchId}/${formatParam}` },
      { status: 404 },
    );
  }

  // Any bookable movie at this branch works as the probe -- price is a
  // property of the hall/format, not the specific film. Picks the
  // soonest-checked bookable row so repeated runs naturally rotate across
  // whatever's currently bookable rather than hammering the same slug.
  // Two queries, not a join: showtimes_cache and movie_branch_slugs have
  // no direct foreign-key relationship to each other (both key off
  // movies/branch_id independently, confirmed against the live schema),
  // so PostgREST can't embed one through the other.
  const { data: bookableRow } = await supabase
    .from('showtimes_cache')
    .select('movie_id, raw_showtimes')
    .eq('branch_id', branchId)
    .eq('bookable', true)
    .order('last_checked_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!bookableRow) {
    return NextResponse.json({ skipped: 'no bookable movie at this branch right now' });
  }

  const dates = filterFutureDates((bookableRow.raw_showtimes as string[]) ?? []);
  if (dates.length === 0) {
    return NextResponse.json({ skipped: 'bookable row has no usable date' });
  }

  const { data: slugRow } = await supabase
    .from('movie_branch_slugs')
    .select('slug')
    .eq('movie_id', bookableRow.movie_id)
    .eq('branch_id', branchId)
    .maybeSingle();
  const resolvedSlug = slugRow?.slug;
  if (!resolvedSlug) {
    return NextResponse.json({ skipped: 'bookable row has no linked slug' });
  }

  // Matched fuzzily against the resolved template row's own format string
  // (not the raw query param) -- the AJAX day-showtimes label and the
  // branch-level format template can differ the same way seat categories
  // do (e.g. District 5's combined "Standard & Deluxe" template row vs a
  // showtime section labeled just "Standard"), see
  // findTemplateRowForFormat's comment.
  const movieDetailsUrl = `${BRANCH_BASE_URLS[branchId]}/movie-details/${resolvedSlug}.html`;
  const dayShowtimes = await fetchDayShowtimes(movieDetailsUrl, dates[0]);
  const matchingShowtime = dayShowtimes.showtimes.find((s) => {
    if (s.soldOut) return false;
    const normalizedShowtimeFormat = s.format.trim().toLowerCase();
    const normalizedTemplateFormat = templateRow.format.trim().toLowerCase();
    return (
      normalizedShowtimeFormat === normalizedTemplateFormat ||
      normalizedTemplateFormat.includes(normalizedShowtimeFormat) ||
      normalizedShowtimeFormat.includes(normalizedTemplateFormat)
    );
  });
  if (!matchingShowtime) {
    return NextResponse.json({ skipped: `no bookable ${templateRow.format} showtime found today` });
  }

  // fetchScenePriceForFormat needs Scene's own real seat-category label
  // (matchingShowtime.format, e.g. "Standard") to find a free seat in the
  // live seat-plan response -- not the template's possibly-combined
  // format string ("Standard & Deluxe" isn't a real st_name value).
  const browser = await launchBrowser();
  let liveObservedPriceEgp: number | null;
  try {
    liveObservedPriceEgp = await fetchScenePriceForFormat(
      browser,
      matchingShowtime.bookingUrl,
      matchingShowtime.format,
    );
  } finally {
    await browser.close();
  }

  const durationMs = Date.now() - startedAt;

  if (liveObservedPriceEgp == null) {
    logEvent({
      type: 'price_check_run',
      payload: {
        branch: branchId,
        format: templateRow.format,
        matched: null,
        templatePriceEgp: templateRow.priceEgp,
        liveObservedPriceEgp: null,
        duration_ms: durationMs,
      },
    });
    return NextResponse.json({ skipped: 'could not verify a live price this run' });
  }

  const matched = liveObservedPriceEgp === templateRow.priceEgp;
  logEvent({
    type: 'price_check_run',
    payload: {
      branch: branchId,
      format: templateRow.format,
      matched,
      templatePriceEgp: templateRow.priceEgp,
      liveObservedPriceEgp,
      duration_ms: durationMs,
    },
  });

  return NextResponse.json({ matched, templatePriceEgp: templateRow.priceEgp, liveObservedPriceEgp });
}
