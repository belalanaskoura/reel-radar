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
      // run's listings MIGHT have been pulled from Scene's site entirely
      // (its own page now returns the "invalid slug" message rather than
      // a real 404, per Phase 0's finding, so its detail page can't
      // signal this on its own) -- or this run's listing fetch just had a
      // transient miss (a slow render, a momentary empty section, a
      // one-off network hiccup), which is indistinguishable from a real
      // delisting using only this run's own result. Confirmed for real:
      // a single-run miss was firing a false "removed" notification for a
      // movie that was never actually pulled, sometimes followed by a
      // same-movie "added" notification once the very next scrape saw it
      // again -- a fully avoidable false-positive churn, not a real
      // lineup change.
      //
      // Fixed with a two-strikes check via pending_removal_since: a
      // first-time miss only marks the row pending (no notification,
      // bookable left untouched) so a transient blip never gets
      // reported; only a SECOND consecutive miss (pending_removal_since
      // already set from the prior run) confirms the removal and fires
      // the notification. A movie that reappears while pending has the
      // flag cleared with nothing ever sent.
      const { data: knownSlugs } = await supabase
        .from('movie_branch_slugs')
        .select('movie_id, slug')
        .eq('branch_id', branch);

      const missingMovieIds = (knownSlugs ?? [])
        .filter((row) => !seenSlugs.has(row.slug))
        .map((row) => row.movie_id);
      const seenMovieIds = (knownSlugs ?? [])
        .filter((row) => seenSlugs.has(row.slug))
        .map((row) => row.movie_id);

      let delistedCount = 0;

      if (seenMovieIds.length > 0) {
        // Reappeared while pending: false alarm, clear the flag. No
        // notification was ever sent for these since the first miss only
        // marks pending, so there's nothing to walk back.
        await supabase
          .from('showtimes_cache')
          .update({ pending_removal_since: null })
          .eq('branch_id', branch)
          .in('movie_id', seenMovieIds)
          .not('pending_removal_since', 'is', null);
      }

      if (missingMovieIds.length > 0) {
        const { data: pendingRows } = await supabase
          .from('showtimes_cache')
          .select('movie_id')
          .eq('branch_id', branch)
          .in('movie_id', missingMovieIds)
          .not('pending_removal_since', 'is', null);
        const alreadyPendingIds = new Set((pendingRows ?? []).map((r) => r.movie_id as string));

        const firstMissIds = missingMovieIds.filter((id) => !alreadyPendingIds.has(id));
        const secondMissIds = missingMovieIds.filter((id) => alreadyPendingIds.has(id));

        if (firstMissIds.length > 0) {
          // last_checked_at is refreshed here too (not just on a confirmed
          // delist below) -- otherwise a movie sitting in its one-run grace
          // period would start looking stale on the admin dashboard despite
          // this sweep actively having just covered it.
          await supabase
            .from('showtimes_cache')
            .update({
              pending_removal_since: new Date().toISOString(),
              last_checked_at: new Date().toISOString(),
            })
            .eq('branch_id', branch)
            .in('movie_id', firstMissIds);
        }

        if (secondMissIds.length > 0) {
          const { data: cleared } = await supabase
            .from('showtimes_cache')
            .update({
              bookable: false,
              raw_showtimes: [],
              pending_removal_since: null,
              last_checked_at: new Date().toISOString(),
            })
            .eq('branch_id', branch)
            .eq('bookable', true)
            .in('movie_id', secondMissIds)
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

          // A delisted movie that was already bookable: false is skipped
          // by the update above (the .eq('bookable', true) filter), so
          // its last_checked_at never gets touched even though this run
          // just re-confirmed it's still absent -- it would otherwise
          // look stale forever on the admin dashboard despite the sweep
          // genuinely covering it every time. Refresh the timestamp
          // unconditionally for every confirmed-still-gone row,
          // independent of the bookable reset above.
          await supabase
            .from('showtimes_cache')
            .update({ pending_removal_since: null, last_checked_at: new Date().toISOString() })
            .eq('branch_id', branch)
            .eq('bookable', false)
            .in('movie_id', secondMissIds);
        }
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
