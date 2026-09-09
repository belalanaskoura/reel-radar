import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchComingSoon, sleep, REQUEST_DELAY_MS } from '@/lib/rns/fetcher';
import { findExistingMovieByTitle } from '@/lib/matching/find-existing-movie';
import { normalizeTitle } from '@/lib/matching/normalize';
import { removeUnreleasableMovies } from '@/lib/matching/remove-unreleasable';
import { notifyNewReleases } from '@/lib/matching/notify-new-releases';
import { logEvent } from '@/lib/analytics';
import { logError } from '@/lib/logger';

// RNS (rnscinemas.com) is this app's catalog-discovery source: its
// coming-soon page is a real Egyptian exhibitor's own curated list of
// what's actually scheduled, replacing the old TMDB-/discover-plus-
// distributor-allowlist heuristic (see egypt-distributor-filter.ts's
// removal). RNS is deliberately NOT modeled as a `branches` row/chain --
// no booking flow, no showtimes_cache -- this route only ever creates or
// attaches `movies` placeholders and stamps a release date; TMDB matching
// for the resulting placeholders is left entirely to the existing
// /api/match-movies job, exactly as it already does for Scene/VOX
// placeholders (matchScenesToTmdb operates on any tmdb_id IS NULL row,
// regardless of source).
//
// One request total (the coming-soon page has every listing, no
// pagination -- confirmed for real, 25/25 titles present in one fetch),
// so unlike scrape-scene/scrape-vox this needs no batching/offset/BATCH_SIZE
// to stay under cron-job.org's 30s timeout.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  try {
    const listings = await fetchComingSoon();

    let created = 0;
    let attached = 0;
    const newlyDatedMovieIds: string[] = [];

    for (const listing of listings) {
      const { data: existingLink } = await supabase
        .from('rns_listings')
        .select('movie_id')
        .eq('slug', listing.slug)
        .maybeSingle();

      let movieId: string;
      let previousReleaseDate: string | null = null;
      let currentPosterPath: string | null = null;
      let isNewAttachment = false;
      let justInserted = false;

      if (existingLink) {
        movieId = existingLink.movie_id;
        const { data: movieRow } = await supabase
          .from('movies')
          .select('release_date, poster_path')
          .eq('id', movieId)
          .maybeSingle();
        previousReleaseDate = movieRow?.release_date ?? null;
        currentPosterPath = movieRow?.poster_path ?? null;
      } else {
        // A new RNS slug doesn't mean a new movie -- it may already exist
        // as a Scene/VOX placeholder or a TMDB-matched row, same
        // title-first check every other scraper does before creating a
        // placeholder (see scrape-scene/scrape-vox's own comments on this).
        isNewAttachment = true;
        const existingByTitle = await findExistingMovieByTitle(supabase, listing.title);

        if (existingByTitle) {
          movieId = existingByTitle;
          const { data: movieRow } = await supabase
            .from('movies')
            .select('release_date, poster_path')
            .eq('id', movieId)
            .maybeSingle();
          previousReleaseDate = movieRow?.release_date ?? null;
          currentPosterPath = movieRow?.poster_path ?? null;

          const { error: linkError } = await supabase
            .from('rns_listings')
            .insert({ movie_id: movieId, slug: listing.slug });
          if (linkError && linkError.code !== '23505') {
            throw new Error(`Failed to insert rns_listings: ${linkError.message}`);
          }
        } else {
          const { data: newMovie, error: insertError } = await supabase
            .from('movies')
            .insert({
              title: listing.title,
              match_status: 'unmatched',
              normalized_title: normalizeTitle(listing.title),
              poster_path: listing.posterUrl,
              release_date: listing.releaseDate,
              release_date_confirmed_eg: listing.releaseDate !== null,
            })
            .select('id')
            .single();

          // Tracks whether movieId points at a placeholder this run just
          // created (safe to delete if the slug-insert race below is lost)
          // versus an existing row found via the title-race recovery path
          // (never delete another row's real movie) -- same shape as
          // scrape-scene/scrape-vox's own race handling.
          let ownsFreshPlaceholder: boolean;

          if (insertError) {
            if (insertError.code !== '23505') {
              throw new Error(`Failed to insert placeholder movie: ${insertError.message}`);
            }
            const existingByNormalizedTitle = await findExistingMovieByTitle(supabase, listing.title);
            if (!existingByNormalizedTitle) {
              throw new Error(
                `Lost the title-insert race for "${listing.title}" but couldn't find the winning row`,
              );
            }
            movieId = existingByNormalizedTitle;
            const { data: movieRow } = await supabase
              .from('movies')
              .select('release_date, poster_path')
              .eq('id', movieId)
              .maybeSingle();
            previousReleaseDate = movieRow?.release_date ?? null;
            currentPosterPath = movieRow?.poster_path ?? null;
            ownsFreshPlaceholder = false;
          } else {
            if (!newMovie) {
              throw new Error(`Failed to insert placeholder movie: no row returned`);
            }
            movieId = newMovie.id;
            ownsFreshPlaceholder = true;
            justInserted = true;
            created += 1;
          }

          const { error: slugInsertError } = await supabase
            .from('rns_listings')
            .insert({ movie_id: movieId, slug: listing.slug });

          if (slugInsertError) {
            if (slugInsertError.code === '23505') {
              const { data: winningLink } = await supabase
                .from('rns_listings')
                .select('movie_id')
                .eq('slug', listing.slug)
                .single();

              if (ownsFreshPlaceholder) {
                await supabase.from('movies').delete().eq('id', movieId);
                created -= 1;
              }

              if (!winningLink) {
                throw new Error(
                  `Lost the slug-insert race for rns/${listing.slug} but couldn't find the winning link`,
                );
              }
              movieId = winningLink.movie_id;
              justInserted = false;
              const { data: winningMovieRow } = await supabase
                .from('movies')
                .select('release_date, poster_path')
                .eq('id', movieId)
                .maybeSingle();
              previousReleaseDate = winningMovieRow?.release_date ?? null;
              currentPosterPath = winningMovieRow?.poster_path ?? null;
            } else {
              throw new Error(`Failed to insert rns_listings: ${slugInsertError.message}`);
            }
          }
        }
      }

      if (isNewAttachment) attached += 1;

      // RNS is treated as authoritative for the Egypt release date once a
      // movie is linked here -- overwrite an existing date the same way a
      // fresh placeholder's insert above sets one, since RNS's own listing
      // is a live, actively-maintained schedule (a date can legitimately
      // move as a release gets pushed), not a one-time historical record
      // like elCinema's backfill.
      if (!justInserted) {
        const updates: Record<string, string | boolean | null> = {};
        if (listing.releaseDate && listing.releaseDate !== previousReleaseDate) {
          updates.release_date = listing.releaseDate;
          updates.release_date_confirmed_eg = true;
        }
        if (!currentPosterPath && listing.posterUrl) {
          updates.poster_path = listing.posterUrl;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('movies').update(updates).eq('id', movieId);
        }
      }

      if (listing.releaseDate && !previousReleaseDate) {
        newlyDatedMovieIds.push(movieId);
      }

      await sleep(REQUEST_DELAY_MS);
    }

    let newReleasesNotified = 0;
    if (newlyDatedMovieIds.length > 0) {
      const result = await notifyNewReleases(supabase, newlyDatedMovieIds);
      newReleasesNotified = result.notified;
    }

    const { removed } = await removeUnreleasableMovies(supabase);

    logEvent({
      type: 'scrape_run',
      payload: {
        source: 'rns',
        branch: null,
        listed: listings.length,
        bookable: 0,
        delisted: 0,
        duration_ms: Date.now() - startedAt,
        error: null,
      },
    });

    return NextResponse.json({
      listed: listings.length,
      created,
      attached,
      newReleasesNotified,
      removed,
    });
  } catch (err) {
    const message = String(err).slice(0, 500);
    logError('scrape-rns', err);
    logEvent({
      type: 'scrape_run',
      payload: {
        source: 'rns',
        branch: null,
        listed: 0,
        bookable: 0,
        delisted: 0,
        duration_ms: Date.now() - startedAt,
        error: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
