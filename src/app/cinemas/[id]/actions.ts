'use server';

import { fetchDayShowtimes, sleep, REQUEST_DELAY_MS } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';

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

// For the per-cinema page's date picker: given every bookable movie's
// slug at this branch, fetches that one date's showtimes for each of
// them and returns which slugs actually have a showtime that day.
//
// This is a real, explicit exception to the low-request-volume principle
// the rest of this app follows (every other live Scene fetch is scoped
// to one movie at a time, triggered by a user expanding it -- see
// ShowtimePicker/getDayShowtimes). Here, selecting a date on a page view
// fans out one request per bookable movie at the branch (currently ~16
// for cfc, ~8 for district5) -- accepted as the cost of a real date
// filter rather than a decorative one, per explicit product decision.
export async function getBranchShowtimesForDate(
  branchId: string,
  movieSlugs: { movieId: string; slug: string }[],
  date: string,
): Promise<{ movieId: string; hasShowtime: boolean }[]> {
  const baseUrl = BRANCH_BASE_URLS[branchId as BranchId];
  if (!baseUrl) throw new Error(`Unknown branch: ${branchId}`);

  return mapWithConcurrency(movieSlugs, DATE_FILTER_CONCURRENCY, async ({ movieId, slug }) => {
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
