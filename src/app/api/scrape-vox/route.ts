import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchVoxShowtimes } from '@/lib/elcinema/vox-showtimes';
import { fetchWorkDetails, sleep, REQUEST_DELAY_MS } from '@/lib/elcinema/fetcher';
import { VOX_ELCINEMA_THEATER_IDS, type VoxBranchId, type VoxDayDetail } from '@/lib/branches';
import { logEvent } from '@/lib/analytics';
import { findExistingMovieByTitle } from '@/lib/matching/find-existing-movie';
import { notifyLineupAdditions, notifyLineupRemovals } from '@/lib/matching/notify-cinema-lineup';

const VOX_BRANCHES = Object.keys(VOX_ELCINEMA_THEATER_IDS) as VoxBranchId[];
const DAYS_AHEAD = 5; // confirmed rolling window: today through +4 have real showtimes, +5 is always empty

// Scrapes elCinema's showtime pages for all 3 (or, via ?branch=, one) VOX
// branches, upserting a placeholder `movies` row (tmdb_id null,
// match_status 'unmatched') for any elCinema work id not already linked
// via movie_branch_slugs, and writing bookability + the full 5-day date
// list into showtimes_cache. Same shape as scrape-scene, except elCinema
// has no cheap bookability-only check (see fetchVoxShowtimes) so this
// route does the full 5-day fetch upfront per branch instead of a
// per-movie fetch -- 5 requests per branch (5 days x 1s REQUEST_DELAY_MS).
// Confirmed for real against the live deployment: one branch takes
// ~10-13s, so all 3 branches in a single call (the ?branch-omitted path)
// reliably blows past the external scheduler's 30s timeout -- that must
// be scheduled as 3 separate ?branch= jobs, same as scrape-scene's own
// cfc/district5 split, not as one combined job.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const branchParam = new URL(request.url).searchParams.get('branch');
  if (branchParam && !VOX_BRANCHES.includes(branchParam as VoxBranchId)) {
    return NextResponse.json({ error: `Unknown branch: ${branchParam}` }, { status: 400 });
  }
  const branchesToScrape: VoxBranchId[] = branchParam ? [branchParam as VoxBranchId] : VOX_BRANCHES;

  const supabase = createServiceRoleClient();
  const results: Record<string, { movies: number; bookable: number; delisted: number }> = {};

  for (const branch of branchesToScrape) {
    const branchStartedAt = Date.now();
    try {
    const theaterId = VOX_ELCINEMA_THEATER_IDS[branch];

    const titleByElcinemaId = new Map<number, string>();
    // Full per-day, per-format, per-showtime detail (times, prices) --
    // not just which dates are bookable -- so the movie detail page can
    // show real VOX showtimes the same way it does for Scene, instead of
    // just a "bookable" flag with a generic outbound link.
    const dayDetailsByElcinemaId = new Map<number, VoxDayDetail[]>();
    let addressBackfill: string | null = null;

    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const date = isoDatePlusDays(dayOffset);
      await sleep(REQUEST_DELAY_MS);
      const day = await fetchVoxShowtimes(theaterId, date);

      if (!addressBackfill && day.address) addressBackfill = day.address;

      for (const movie of day.movies) {
        const formatsWithShowtimes = movie.formats.filter((f) => f.showtimes.length > 0);
        if (formatsWithShowtimes.length === 0) continue;
        titleByElcinemaId.set(movie.elcinemaId, movie.title);
        const details = dayDetailsByElcinemaId.get(movie.elcinemaId) ?? [];
        details.push({ date, formats: formatsWithShowtimes });
        dayDetailsByElcinemaId.set(movie.elcinemaId, details);
      }
    }

    if (addressBackfill) {
      const { data: branchRow } = await supabase.from('branches').select('address').eq('id', branch).maybeSingle();
      if (branchRow && !branchRow.address) {
        await supabase.from('branches').update({ address: addressBackfill }).eq('id', branch);
      }
    }

    let bookableCount = 0;
    const newlyLinkedMovieIds: string[] = [];
    for (const [elcinemaId, title] of titleByElcinemaId) {
      const slug = String(elcinemaId);

      const { data: existingLink } = await supabase
        .from('movie_branch_slugs')
        .select('movie_id')
        .eq('branch_id', branch)
        .eq('slug', slug)
        .maybeSingle();

      let movieId: string;

      if (existingLink) {
        movieId = existingLink.movie_id;
      } else {
        // Same title-first check as scrape-scene: a new elCinema work id
        // for this branch doesn't mean this is a new movie -- it may
        // already exist as a Scene placeholder or a TMDB-sourced matched
        // row under a different id. Attach the new slug to that row
        // instead of spawning a disconnected duplicate.
        const existingByTitle = await findExistingMovieByTitle(supabase, title);

        if (existingByTitle) {
          movieId = existingByTitle;
          const { error: linkError } = await supabase
            .from('movie_branch_slugs')
            .insert({ movie_id: movieId, branch_id: branch, slug });
          if (linkError && linkError.code !== '23505') {
            throw new Error(`Failed to insert movie_branch_slugs: ${linkError.message}`);
          }
        } else {
          const { data: newMovie, error: insertError } = await supabase
            .from('movies')
            .insert({ title, match_status: 'unmatched' })
            .select('id')
            .single();

          if (insertError || !newMovie) {
            throw new Error(`Failed to insert placeholder movie: ${insertError?.message}`);
          }
          movieId = newMovie.id;

          const { error: slugInsertError } = await supabase
            .from('movie_branch_slugs')
            .insert({ movie_id: movieId, branch_id: branch, slug });

          if (slugInsertError) {
            // 23505 = unique violation on (branch_id, slug): a concurrent
            // scrape run won the insert first, same race scrape-scene
            // handles. Use its link instead, delete our orphaned movie row.
            if (slugInsertError.code === '23505') {
              const { data: winningLink } = await supabase
                .from('movie_branch_slugs')
                .select('movie_id')
                .eq('branch_id', branch)
                .eq('slug', slug)
                .single();

              await supabase.from('movies').delete().eq('id', movieId);

              if (!winningLink) {
                throw new Error(`Lost the slug-insert race for ${branch}/${slug} but couldn't find the winning link`);
              }
              movieId = winningLink.movie_id;
            } else {
              throw new Error(`Failed to insert movie_branch_slugs: ${slugInsertError.message}`);
            }
          }
        }

        // Reached only when this elCinema work id had no existing
        // movie_branch_slugs row for this branch -- new to this branch's
        // lineup this run, regardless of which sub-path resolved movieId.
        newlyLinkedMovieIds.push(movieId);
      }

      // VOX movies never get a poster from anywhere else until they're
      // TMDB-matched (getEgyptReleaseInfo's poster fallback is keyed by
      // tmdb_id, so it can't help a still-unmatched placeholder) --
      // unlike Scene, which fills one in from its own listing page during
      // scraping. Fetch elCinema's work page directly (same source
      // getEgyptReleaseInfo uses post-match, just reached via the elCinema
      // id this route already has instead of a title search) as a
      // placeholder-stage fallback, only when the row doesn't already
      // have one, so an already-TMDB-matched or already-postered row
      // never pays for this extra request.
      const { data: movieRow } = await supabase
        .from('movies')
        .select('poster_path')
        .eq('id', movieId)
        .maybeSingle();

      if (!movieRow?.poster_path) {
        try {
          await sleep(REQUEST_DELAY_MS);
          const details = await fetchWorkDetails(elcinemaId);
          if (details.posterUrl) {
            await supabase.from('movies').update({ poster_path: details.posterUrl }).eq('id', movieId);
          }
        } catch {
          // elCinema unreachable/unexpected markup for this one work page --
          // skip the poster for this run rather than failing the whole
          // branch scrape over a display detail; the next run retries.
        }
      }

      const dayDetails = dayDetailsByElcinemaId.get(elcinemaId) ?? [];
      if (dayDetails.length > 0) bookableCount += 1;

      await supabase.from('showtimes_cache').upsert(
        {
          movie_id: movieId,
          branch_id: branch,
          bookable: dayDetails.length > 0,
          last_checked_at: new Date().toISOString(),
          raw_showtimes: dayDetails,
        },
        { onConflict: 'movie_id,branch_id' },
      );
    }

    if (newlyLinkedMovieIds.length > 0) {
      await notifyLineupAdditions(supabase, branch, newlyLinkedMovieIds);
    }

    // A movie previously linked to this branch but absent from this run's
    // elCinema listing has finished its run there -- unlike scrape-scene
    // (which needs a separate scrape-scene-delist job because its
    // bookability checks are batched by offset, see that route's own
    // comment), this run already has the branch's COMPLETE current
    // listing in titleByElcinemaId, so delisting can happen inline with
    // no extra fetch. Without this, a movie's last-known showtimes_cache
    // row (bookable: true, real dates) sits unchanged forever once
    // elCinema stops listing it -- confirmed for real via the admin
    // dashboard's stale-rows check: several VOX movies were still shown
    // bookable a week after their real run ended.
    const seenSlugs = new Set([...titleByElcinemaId.keys()].map(String));
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

      const justRemovedMovieIds = (cleared ?? []).map((row) => row.movie_id as string);
      if (justRemovedMovieIds.length > 0) {
        await notifyLineupRemovals(supabase, branch, justRemovedMovieIds);
      }

      // A delisted movie already bookable: false is skipped by the update
      // above (.eq('bookable', true)), so its last_checked_at never gets
      // touched even though this run just re-confirmed it's still absent
      // -- it would otherwise look stale forever on the admin dashboard
      // despite the sweep genuinely covering it every time. Same fix
      // scrape-scene-delist applies for the same reason.
      await supabase
        .from('showtimes_cache')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('branch_id', branch)
        .eq('bookable', false)
        .in('movie_id', delistedMovieIds);
    }

    results[branch] = { movies: titleByElcinemaId.size, bookable: bookableCount, delisted: delistedCount };

    logEvent({
      type: 'scrape_run',
      payload: {
        source: 'vox',
        branch,
        listed: titleByElcinemaId.size,
        bookable: bookableCount,
        delisted: delistedCount,
        duration_ms: Date.now() - branchStartedAt,
        error: null,
      },
    });
    } catch (err) {
      results[branch] = { movies: 0, bookable: 0, delisted: 0 };
      logEvent({
        type: 'scrape_run',
        payload: {
          source: 'vox',
          branch,
          listed: 0,
          bookable: 0,
          delisted: 0,
          duration_ms: Date.now() - branchStartedAt,
          error: String(err).slice(0, 500),
        },
      });
      // One branch's failure shouldn't take down a combined-branches call.
    }
  }

  return NextResponse.json(results);
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
