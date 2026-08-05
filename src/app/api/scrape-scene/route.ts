import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchAllListings, checkBookability, sleep, REQUEST_DELAY_MS } from '@/lib/scene/fetcher';
import type { BranchId } from '@/lib/scene/types';

const BRANCHES: BranchId[] = ['cfc', 'district5'];

// Scrapes both Scene branches' listing pages, upserts a placeholder
// `movies` row (tmdb_id null, match_status 'unmatched') for any slug not
// already linked via `movie_branch_slugs`, and writes bookability into
// `showtimes_cache`. Phase 5 later matches these placeholder rows to real
// TMDB entries instead of creating new ones; title/slug is enough for
// this phase to prove the scraper and cache work end to end.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const results: Record<string, { listed: number; bookable: number }> = {};

  for (const branch of BRANCHES) {
    const listings = await fetchAllListings(branch);
    let bookableCount = 0;

    for (const listing of listings) {
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

        await supabase
          .from('movie_branch_slugs')
          .insert({ movie_id: movieId, branch_id: branch, slug: listing.slug });
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

    results[branch] = { listed: listings.length, bookable: bookableCount };
  }

  return NextResponse.json(results);
}