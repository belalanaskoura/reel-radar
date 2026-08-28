import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchAllListings } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { logEvent } from '@/lib/analytics';
import { logError } from '@/lib/logger';
import { notifyLineupRemovals } from '@/lib/matching/notify-cinema-lineup';

const BRANCHES = Object.keys(BRANCH_BASE_URLS) as BranchId[];

// Split out of /api/scrape-scene when that route was batched by offset
// (see its own file comment): delisting -- marking a movie not-bookable
// once it's been pulled from Scene's site entirely -- needs the COMPLETE
// listing to know what's really gone, which no single offset-limited
// batch has. This route only does the two lightweight listing-page
// fetches (no per-movie bookability checks, no placeholder creation),
// so it's fast regardless of how large a branch's catalog gets and can
// run as its own independent job on cron-job.org.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const branchParam = new URL(request.url).searchParams.get('branch');
  if (branchParam && !BRANCHES.includes(branchParam as BranchId)) {
    return NextResponse.json({ error: `Unknown branch: ${branchParam}` }, { status: 400 });
  }
  const branchesToScrape: BranchId[] = branchParam ? [branchParam as BranchId] : BRANCHES;

  const supabase = createServiceRoleClient();
  const results: Record<string, { delisted: number }> = {};

  for (const branch of branchesToScrape) {
    const branchStartedAt = Date.now();
    try {
      const listings = await fetchAllListings(branch);
      const seenSlugs = new Set(listings.map((l) => l.slug));

      // A movie previously linked to this branch but absent from this
      // run's listings has been pulled from Scene's site entirely (its
      // own page now returns the "invalid slug" message rather than a
      // real 404, per Phase 0's finding, so its detail page can't signal
      // this on its own). Without this, a delisted movie's last-known
      // showtimes_cache row (bookable: true, real dates) sits unchanged
      // forever, since nothing else ever revisits it -- /api/poll only
      // covers watchlisted movies. Confirmed for real: a movie pulled
      // from CFC's site kept showing a stale bookable date days after it
      // stopped being bookable there.
      const { data: knownSlugs } = await supabase
        .from('movie_branch_slugs')
        .select('movie_id, slug')
        .eq('branch_id', branch);

      const delistedMovieIds = (knownSlugs ?? [])
        .filter((row) => !seenSlugs.has(row.slug))
        .map((row) => row.movie_id);

      let delistedCount = 0;
      if (delistedMovieIds.length > 0) {
        const { data: cleared } = await supabase
          .from('showtimes_cache')
          .update({ bookable: false, raw_showtimes: [], last_checked_at: new Date().toISOString() })
          .eq('branch_id', branch)
          .eq('bookable', true)
          .in('movie_id', delistedMovieIds)
          .select('movie_id');
        delistedCount = cleared?.length ?? 0;

        // Only movies that just transitioned bookable -> gone this run
        // (the rows the update above actually touched), not every
        // historically-delisted movie still linked to this branch --
        // otherwise a movie gone for weeks would renotify on every sweep.
        const justRemovedMovieIds = (cleared ?? []).map((row) => row.movie_id as string);
        if (justRemovedMovieIds.length > 0) {
          await notifyLineupRemovals(supabase, branch, justRemovedMovieIds);
        }

        // A delisted movie that was already bookable: false is skipped by
        // the update above (the .eq('bookable', true) filter), so its
        // last_checked_at never gets touched even though this run just
        // re-confirmed it's still absent -- it would otherwise look stale
        // forever on the admin dashboard despite the sweep genuinely
        // covering it every time. Refresh the timestamp unconditionally
        // for every delisted row, independent of the bookable reset above.
        await supabase
          .from('showtimes_cache')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('branch_id', branch)
          .eq('bookable', false)
          .in('movie_id', delistedMovieIds);
      }

      results[branch] = { delisted: delistedCount };

      logEvent({
        type: 'scrape_delist_run',
        payload: {
          branch,
          listed: listings.length,
          delisted: delistedCount,
          duration_ms: Date.now() - branchStartedAt,
          error: null,
        },
      });
    } catch (err) {
      results[branch] = { delisted: 0 };
      logError('scrape-scene-delist', err, { branch });
      logEvent({
        type: 'scrape_delist_run',
        payload: {
          branch,
          listed: 0,
          delisted: 0,
          duration_ms: Date.now() - branchStartedAt,
          error: String(err).slice(0, 500),
        },
      });
    }
  }

  return NextResponse.json(results);
}
