import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchAllListings, checkBookability, sleep, REQUEST_DELAY_MS } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';

const BRANCHES = Object.keys(BRANCH_BASE_URLS) as BranchId[];

// Scrapes one (or, if ?branch is omitted, both) Scene branch's listing
// pages, upserts a placeholder `movies` row (tmdb_id null, match_status
// 'unmatched') for any slug not already linked via `movie_branch_slugs`,
// and writes bookability into `showtimes_cache`. Phase 5 later matches
// these placeholder rows to real TMDB entries instead of creating new
// ones; title/slug is enough for this phase to prove the scraper and
// cache work end to end.
//
// Split into a ?branch=cfc / ?branch=district5 param (rather than always
// scraping both in one call) because the free external scheduler this
// app relies on (no Vercel Cron on Hobby, see Phase 1) caps a single job
// at a 30s timeout: scraping ~35 movies combined, at REQUEST_DELAY_MS
// (2s) between each polite fetch, takes 70s+ of sleep alone before any
// real network/DB time, so one combined call cannot reliably finish in
// time. Omitting ?branch still scrapes both sequentially in one call,
// for manual/local use where the 30s cap doesn't apply.
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
  const results: Record<string, { listed: number; bookable: number; delisted: number }> = {};

  for (const branch of branchesToScrape) {
    const listings = await fetchAllListings(branch);
    let bookableCount = 0;
    let delistedCount = 0;
    const seenSlugs = new Set<string>();

    for (const listing of listings) {
      seenSlugs.add(listing.slug);
      // Find an existing slug link for this branch, or create a
      // placeholder movie + link if this slug hasn't been seen before.
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

    // A movie previously linked to this branch but absent from this
    // run's listings has been pulled from Scene's site entirely (its own
    // page now returns the "invalid slug" message rather than a real
    // 404, per Phase 0's finding, so its detail page can't signal this on
    // its own). Without this, a delisted movie's last-known
    // showtimes_cache row (bookable: true, real dates) sits unchanged
    // forever, since nothing else ever revisits it -- /api/poll only
    // covers watchlisted movies, and this scraper otherwise only ever
    // touches slugs still present in the current listing. Confirmed for
    // real: a movie pulled from CFC's site kept showing a stale bookable
    // date days after it stopped being bookable there.
    const { data: knownSlugs } = await supabase
      .from('movie_branch_slugs')
      .select('movie_id, slug')
      .eq('branch_id', branch);

    const delistedMovieIds = (knownSlugs ?? [])
      .filter((row) => !seenSlugs.has(row.slug))
      .map((row) => row.movie_id);

    if (delistedMovieIds.length > 0) {
      const { data: cleared } = await supabase
        .from('showtimes_cache')
        .update({ bookable: false, raw_showtimes: [], last_checked_at: new Date().toISOString() })
        .eq('branch_id', branch)
        .eq('bookable', true)
        .in('movie_id', delistedMovieIds)
        .select('movie_id');
      delistedCount = cleared?.length ?? 0;
    }

    results[branch] = { listed: listings.length, bookable: bookableCount, delisted: delistedCount };
  }

  return NextResponse.json(results);
}