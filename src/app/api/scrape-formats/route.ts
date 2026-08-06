import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchDayShowtimes, sleep, REQUEST_DELAY_MS } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';

const BRANCHES = Object.keys(BRANCH_BASE_URLS) as BranchId[];

// Records which showtime formats (Standard, Premiere/VIP, IMAX, ...) are
// currently available at each branch, for display on /cinemas. This data
// doesn't exist anywhere else: fetchDayShowtimes returns per-showtime
// format strings, but nothing persists them -- /api/scrape-scene only
// ever stores bookable dates (showtimes_cache.raw_showtimes), not
// per-showtime detail, and fetchDayShowtimes itself is normally called
// live, on demand, from the movie detail page's showtime picker.
//
// Deliberately a separate job from /api/scrape-scene (every 30 min, and
// already close to cron-job.org's 30s free-tier timeout -- see that
// route's own comment) rather than folded into it: formats don't need to
// be as fresh as bookability, and adding one more Scene request per
// bookable movie there risked blowing the existing budget again. Meant
// to run once daily, split by ?branch= the same way scrape-scene is, for
// the same reason (timeout headroom).
//
// One extra request per currently-bookable movie (not per bookable day):
// only the first available date is sampled, since a branch's set of
// formats is effectively static day to day -- fetching every day of
// every bookable movie would multiply the request count for no real gain.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const branchParam = new URL(request.url).searchParams.get('branch');
  if (branchParam && !BRANCHES.includes(branchParam as BranchId)) {
    return NextResponse.json({ error: `Unknown branch: ${branchParam}` }, { status: 400 });
  }
  const branchesToScrape: BranchId[] = branchParam ? [branchParam as BranchId] : BRANCHES;

  const supabase = createServiceRoleClient();
  const results: Record<string, { checked: number; formats: string[] }> = {};

  for (const branch of branchesToScrape) {
    const { data: bookableRows } = await supabase
      .from('showtimes_cache')
      .select('movie_id, raw_showtimes')
      .eq('branch_id', branch)
      .eq('bookable', true);

    const movieIds = (bookableRows ?? []).map((r) => r.movie_id);
    const { data: slugRows } = movieIds.length
      ? await supabase
          .from('movie_branch_slugs')
          .select('movie_id, slug')
          .eq('branch_id', branch)
          .in('movie_id', movieIds)
      : { data: [] };
    const slugByMovieId = new Map((slugRows ?? []).map((r) => [r.movie_id, r.slug]));

    const formatsSeen = new Set<string>();
    let checked = 0;

    for (const row of bookableRows ?? []) {
      const dates = Array.isArray(row.raw_showtimes) ? (row.raw_showtimes as string[]) : [];
      const firstDate = dates[0];
      const slug = slugByMovieId.get(row.movie_id);
      if (!firstDate || !slug) continue;

      const movieDetailsUrl = `${BRANCH_BASE_URLS[branch]}/movie-details/${slug}.html`;

      await sleep(REQUEST_DELAY_MS);
      const dayShowtimes = await fetchDayShowtimes(movieDetailsUrl, firstDate);
      checked += 1;

      for (const showtime of dayShowtimes.showtimes) {
        formatsSeen.add(showtime.format);
      }
    }

    const formats = [...formatsSeen].sort();

    await supabase.from('branches').update({ formats }).eq('id', branch);

    results[branch] = { checked, formats };
  }

  return NextResponse.json(results);
}
