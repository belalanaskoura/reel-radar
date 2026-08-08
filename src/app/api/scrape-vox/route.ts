import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { fetchVoxShowtimes } from '@/lib/elcinema/vox-showtimes';
import { sleep, REQUEST_DELAY_MS } from '@/lib/elcinema/fetcher';
import { VOX_ELCINEMA_THEATER_IDS, type VoxBranchId } from '@/lib/branches';

const VOX_BRANCHES = Object.keys(VOX_ELCINEMA_THEATER_IDS) as VoxBranchId[];
const DAYS_AHEAD = 5; // confirmed rolling window: today through +4 have real showtimes, +5 is always empty

// Scrapes elCinema's showtime pages for all 3 (or, via ?branch=, one) VOX
// branches, upserting a placeholder `movies` row (tmdb_id null,
// match_status 'unmatched') for any elCinema work id not already linked
// via movie_branch_slugs, and writing bookability + the full 5-day date
// list into showtimes_cache. Same shape as scrape-scene, except elCinema
// has no cheap bookability-only check (see fetchVoxShowtimes) so this
// route does the full 5-day fetch upfront per branch instead of a
// per-movie fetch -- 3 branches x 5 days = 15 requests per full run,
// comfortably inside the external scheduler's 30s budget.
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
  const results: Record<string, { movies: number; bookable: number }> = {};

  for (const branch of branchesToScrape) {
    const theaterId = VOX_ELCINEMA_THEATER_IDS[branch];

    const titleByElcinemaId = new Map<number, string>();
    const bookableDatesByElcinemaId = new Map<number, string[]>();
    let addressBackfill: string | null = null;

    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const date = isoDatePlusDays(dayOffset);
      await sleep(REQUEST_DELAY_MS);
      const day = await fetchVoxShowtimes(theaterId, date);

      if (!addressBackfill && day.address) addressBackfill = day.address;

      for (const movie of day.movies) {
        const hasShowtimes = movie.formats.some((f) => f.showtimes.length > 0);
        if (!hasShowtimes) continue;
        titleByElcinemaId.set(movie.elcinemaId, movie.title);
        // A movie can have multiple format blocks (e.g. "Standard" and
        // "MAX VIP") on the same day -- dedupe so raw_showtimes represents
        // distinct bookable days, not one entry per format.
        const dates = bookableDatesByElcinemaId.get(movie.elcinemaId) ?? [];
        if (!dates.includes(date)) dates.push(date);
        bookableDatesByElcinemaId.set(movie.elcinemaId, dates);
      }
    }

    if (addressBackfill) {
      const { data: branchRow } = await supabase.from('branches').select('address').eq('id', branch).maybeSingle();
      if (branchRow && !branchRow.address) {
        await supabase.from('branches').update({ address: addressBackfill }).eq('id', branch);
      }
    }

    let bookableCount = 0;
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

      const dates = bookableDatesByElcinemaId.get(elcinemaId) ?? [];
      if (dates.length > 0) bookableCount += 1;

      await supabase.from('showtimes_cache').upsert(
        {
          movie_id: movieId,
          branch_id: branch,
          bookable: dates.length > 0,
          last_checked_at: new Date().toISOString(),
          raw_showtimes: dates,
        },
        { onConflict: 'movie_id,branch_id' },
      );
    }

    results[branch] = { movies: titleByElcinemaId.size, bookable: bookableCount };
  }

  return NextResponse.json(results);
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
