'use server';

import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { fetchDayShowtimes, sleep, REQUEST_DELAY_MS } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { isValidShowtimeDate } from '@/lib/scene/dates';

// Runs `fn` over `items` with at most `size` in flight at once, rather
// than either fully sequential (slow) or fully concurrent (a burst that
// hammers Scene). Same pattern as sync-movies' mapWithConcurrency.
async function mapWithConcurrency<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

// A handful of requests in flight at once instead of one at a time --
// cuts wall-clock time roughly by this factor (e.g. 16 sequential
// requests at ~250ms delay + real network time each is 8-12s+; batches
// of 4 bring that down to ~2-3s) while still being far gentler than
// firing all of them at once. REQUEST_DELAY_MS is kept as a per-worker
// pace, not dropped, so this isn't "no rate limit," just a narrower one.
const DATE_FILTER_CONCURRENCY = 4;

// Hard ceiling on how many movies one call may fan out to. The largest
// real branch is around 20 bookable titles, so this is generous for
// legitimate use while bounding the worst case.
const MAX_MOVIES_PER_CALL = 40;

// For the per-cinema page's date picker: given a branch and a date,
// returns which of that branch's bookable movies actually have a showtime
// that day.
//
// This is a real, explicit exception to the low-request-volume principle
// the rest of this app follows (every other live Scene fetch is scoped
// to one movie at a time, triggered by a user expanding it -- see
// ShowtimePicker/getDayShowtimes). Here, selecting a date on a page view
// fans out one request per bookable movie at the branch (currently ~16
// for cfc, ~8 for district5) -- accepted as the cost of a real date
// filter rather than a decorative one, per explicit product decision.
//
// SECURITY: this used to take the movie/slug list as an argument from the
// client. A 'use server' export is a public HTTP endpoint, so that let an
// anonymous caller hand over an arbitrary-length list of arbitrary slugs
// and have this server issue one outbound request per entry -- a request
// amplifier pointed at scenecinemas.com, billed to us, from our IP. The
// slug list is now resolved server-side from the branch id, so the caller
// chooses only which branch and which date, never which URLs get fetched
// or how many.
export async function getBranchShowtimesForDate(
  branchId: string,
  date: string,
): Promise<{ movieId: string; hasShowtime: boolean }[]> {
  const baseUrl = BRANCH_BASE_URLS[branchId as BranchId];
  if (!baseUrl) throw new Error(`Unknown branch: ${branchId}`);
  if (!isValidShowtimeDate(date)) throw new Error('Invalid date');

  // Capping the per-call fan-out bounds one call; this bounds the number
  // of calls. The page itself caches per date client-side, so a real user
  // hits this once per date they tap, not repeatedly.
  const ip = clientIp(await headers());
  if (!(await checkRateLimit(`branch-showtimes:ip:${ip}`, 30, 3600))) {
    throw new Error('Too many requests. Try again later.');
  }

  const supabase = createServiceRoleClient();

  // Only currently-bookable rows at this branch, which is exactly the set
  // the date picker is filtering over.
  const { data: bookableRows } = await supabase
    .from('showtimes_cache')
    .select('movie_id')
    .eq('branch_id', branchId)
    .eq('bookable', true);

  const movieIds = (bookableRows ?? []).map((r) => r.movie_id as string);
  if (movieIds.length === 0) return [];

  const { data: slugRows } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id, slug')
    .eq('branch_id', branchId)
    .in('movie_id', movieIds);

  const targets = (slugRows ?? [])
    .map((r) => ({ movieId: r.movie_id as string, slug: r.slug as string }))
    .slice(0, MAX_MOVIES_PER_CALL);

  return mapWithConcurrency(targets, DATE_FILTER_CONCURRENCY, async ({ movieId, slug }) => {
    await sleep(REQUEST_DELAY_MS);
    try {
      const movieDetailsUrl = `${baseUrl}/movie-details/${slug}.html`;
      const dayShowtimes = await fetchDayShowtimes(movieDetailsUrl, date);
      return { movieId, hasShowtime: dayShowtimes.showtimes.length > 0 };
    } catch {
      // best-effort: a single movie's fetch failing shouldn't fail the
      // whole date-filter action, just leave it out of that date's results
      return { movieId, hasShowtime: false };
    }
  });
}
