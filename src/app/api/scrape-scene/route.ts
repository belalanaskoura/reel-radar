import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchAllListings, checkBookability, sleep, REQUEST_DELAY_MS } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { logEvent } from '@/lib/analytics';
import { findExistingMovieByTitle } from '@/lib/matching/find-existing-movie';
import { notifyLineupAdditions } from '@/lib/matching/notify-cinema-lineup';

const BRANCHES = Object.keys(BRANCH_BASE_URLS) as BranchId[];

// Movies processed (bookability-checked, one real request each) per call.
// CFC alone grew from ~20 to 22+ listings and started missing
// cron-job.org's 30s timeout entirely (confirmed for real: one run
// logged duration_ms 30006, and a 107-minute gap appeared in the scrape
// log where 3+ scheduled runs should have landed -- a run killed by the
// scheduler's own timeout never reaches the logEvent call at the end of
// this function, so it leaves no trace at all, not even a logged
// failure). At ~1.1-1.4s/movie (bookability fetch + REQUEST_DELAY_MS),
// 10 movies lands around 11-15s, comfortable margin under 30s even as
// the catalog keeps growing -- unlike a fixed listed-count assumption,
// this stays correct regardless of how large a branch's listing gets.
const BATCH_SIZE = 10;

// Scrapes one Scene branch's listing pages and upserts a placeholder
// `movies` row (tmdb_id null, match_status 'unmatched') for any slug not
// already linked via `movie_branch_slugs`, checking bookability for one
// BATCH_SIZE-sized slice of that branch's listing per call (?offset=,
// defaults to 0) rather than the whole branch at once -- see BATCH_SIZE's
// comment for why. cron-job.org calls this multiple times per branch at
// staggered offsets to cover the full listing every sweep. Delisting
// (marking a movie not-bookable once it's dropped from Scene's site
// entirely) is NOT done here -- it needs the complete listing to know
// what's really gone, which no single batch has; see
// /api/scrape-scene-delist for that, run as its own separate job.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const branchParam = url.searchParams.get('branch');
  if (branchParam && !BRANCHES.includes(branchParam as BranchId)) {
    return NextResponse.json({ error: `Unknown branch: ${branchParam}` }, { status: 400 });
  }
  const branchesToScrape: BranchId[] = branchParam ? [branchParam as BranchId] : BRANCHES;

  const offsetParam = url.searchParams.get('offset');
  const offset = offsetParam ? Number(offsetParam) : 0;
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: `Invalid offset: ${offsetParam}` }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const results: Record<string, { listed: number; batchSize: number; bookable: number }> = {};

  for (const branch of branchesToScrape) {
    const branchStartedAt = Date.now();
    try {
      const listings = await fetchAllListings(branch);
      const batch = listings.slice(offset, offset + BATCH_SIZE);
      let bookableCount = 0;
      const newlyLinkedMovieIds: string[] = [];

      for (const listing of batch) {
        const { data: existingLink } = await supabase
          .from('movie_branch_slugs')
          .select('movie_id')
          .eq('branch_id', branch)
          .eq('slug', listing.slug)
          .maybeSingle();

        let movieId: string;
        let currentPosterPath: string | null = null;

        if (existingLink) {
          movieId = existingLink.movie_id;
          const { data: movieRow } = await supabase
            .from('movies')
            .select('poster_path')
            .eq('id', movieId)
            .maybeSingle();
          currentPosterPath = movieRow?.poster_path ?? null;
        } else {
          // Before creating a fresh placeholder, check whether a movie with
          // this title already exists anywhere in the table (matched,
          // ambiguous, or another branch's unmatched placeholder) -- this is
          // a new slug, but not necessarily a new movie. Without this check,
          // every new (branch, slug) pairing for an already-known title (a
          // re-scrape after a matched movie later gets listed on a second
          // branch, or a movie discovered via VOX/elCinema first) spawns a
          // disconnected duplicate row that mergeSceneDuplicates/
          // matchScenesToTmdb can never reconcile, since both only ever
          // operate on tmdb_id IS NULL rows -- confirmed for real, producing
          // "The End of Oak Street" as three separate movies rows.
          const existingByTitle = await findExistingMovieByTitle(supabase, listing.title);

          if (existingByTitle) {
            movieId = existingByTitle;
            const { data: movieRow } = await supabase
              .from('movies')
              .select('poster_path')
              .eq('id', movieId)
              .maybeSingle();
            currentPosterPath = movieRow?.poster_path ?? null;

            const { error: linkError } = await supabase
              .from('movie_branch_slugs')
              .insert({ movie_id: movieId, branch_id: branch, slug: listing.slug });
            if (linkError && linkError.code !== '23505') {
              throw new Error(`Failed to insert movie_branch_slugs: ${linkError.message}`);
            }
          } else {
            const { data: newMovie, error: insertError } = await supabase
              .from('movies')
              .insert({ title: listing.title, match_status: 'unmatched' })
              .select('id')
              .single();

            if (insertError || !newMovie) {
              throw new Error(`Failed to insert placeholder movie: ${insertError?.message}`);
            }
            movieId = newMovie.id;

            const { error: slugInsertError } = await supabase
              .from('movie_branch_slugs')
              .insert({ movie_id: movieId, branch_id: branch, slug: listing.slug });

            if (slugInsertError) {
              // 23505 = unique violation on (branch_id, slug): a concurrent
              // scrape run (now that the external scheduler runs this every
              // 30 min, overlapping runs are real, not hypothetical -- this
              // exact race produced 4 duplicate "Toy Story 5 DUB" placeholder
              // rows before the unique constraint existed) won the insert
              // first. Use its link instead of ours, and delete the orphaned
              // `movies` row this run just created for it, since nothing
              // points at it and it would otherwise sit as a duplicate.
              if (slugInsertError.code === '23505') {
                const { data: winningLink } = await supabase
                  .from('movie_branch_slugs')
                  .select('movie_id, movies(poster_path)')
                  .eq('branch_id', branch)
                  .eq('slug', listing.slug)
                  .single();

                await supabase.from('movies').delete().eq('id', movieId);

                if (!winningLink) {
                  throw new Error(
                    `Lost the slug-insert race for ${branch}/${listing.slug} but couldn't find the winning link`,
                  );
                }
                movieId = winningLink.movie_id;
                currentPosterPath =
                  (winningLink.movies as unknown as { poster_path: string | null } | null)
                    ?.poster_path ?? null;
              } else {
                throw new Error(`Failed to insert movie_branch_slugs: ${slugInsertError.message}`);
              }
            }
          }

          // Reached only when this slug had no existing movie_branch_slugs
          // row for this branch -- i.e. it's new to this branch's lineup
          // this run, regardless of which sub-path resolved movieId.
          newlyLinkedMovieIds.push(movieId);
        }

        await sleep(REQUEST_DELAY_MS);
        const bookability = await checkBookability(listing.url);
        if (bookability.bookable) bookableCount += 1;

        // Scene is the last-resort poster fallback (TMDB, then elCinema,
        // then this): only fill it in, never overwrite an existing one.
        if (!currentPosterPath && bookability.posterUrl) {
          await supabase
            .from('movies')
            .update({ poster_path: bookability.posterUrl })
            .eq('id', movieId);
        }

        await supabase.from('showtimes_cache').upsert(
          {
            movie_id: movieId,
            branch_id: branch,
            bookable: bookability.bookable,
            last_checked_at: new Date().toISOString(),
            raw_showtimes: bookability.availableDates,
          },
          { onConflict: 'movie_id,branch_id' },
        );
      }

      if (newlyLinkedMovieIds.length > 0) {
        await notifyLineupAdditions(supabase, branch, newlyLinkedMovieIds);
      }

      results[branch] = { listed: listings.length, batchSize: batch.length, bookable: bookableCount };

      logEvent({
        type: 'scrape_run',
        payload: {
          source: 'scene',
          branch,
          listed: listings.length,
          bookable: bookableCount,
          delisted: 0,
          duration_ms: Date.now() - branchStartedAt,
          error: null,
          batchSize: batch.length,
          offset,
        },
      });
    } catch (err) {
      results[branch] = { listed: 0, batchSize: 0, bookable: 0 };
      logEvent({
        type: 'scrape_run',
        payload: {
          source: 'scene',
          branch,
          listed: 0,
          bookable: 0,
          delisted: 0,
          duration_ms: Date.now() - branchStartedAt,
          error: String(err).slice(0, 500),
          offset,
        },
      });
      // One branch's failure shouldn't take down a combined-branches call
      // (the ?branch-omitted path scrapes both sequentially) -- move on
      // to the next branch instead of aborting the whole request.
    }
  }

  return NextResponse.json(results);
}
