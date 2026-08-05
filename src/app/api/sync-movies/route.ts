import { NextResponse } from 'next/server';
import { fetchUpcomingMovies } from '@/lib/tmdb';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isLikelyEgyptRelease } from '@/lib/matching/egypt-distributor-filter';
import { getEgyptReleaseDate } from '@/lib/matching/egypt-release-date';

// Pulls upcoming movies from TMDB and upserts them into the `movies` table.
// Matched on tmdb_id so re-running is idempotent. Does not touch Scene
// Cinemas at all -- that's Phase 4/5.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  // End-of-2029 cutoff, per the browse page's "browse through everything
  // coming out till 2029" goal -- TMDB has very little confirmed data
  // that far out today, so this window will fill in gradually as TMDB's
  // own catalog does, not all at once.
  const endOf2029 = new Date(Date.UTC(2029, 11, 31));

  const fromDate = today.toISOString().slice(0, 10);
  const toDate = endOf2029.toISOString().slice(0, 10);

  const candidates = await fetchUpcomingMovies(fromDate, toDate);

  const supabase = createServiceRoleClient();

  // Every candidate is checked against the real Egypt-distributor history
  // (or the popularity safety net) before being stored -- see
  // src/lib/matching/egypt-distributor-filter.ts for why this replaced
  // the earlier genre/language guesswork.
  const movies = [];
  for (const movie of candidates) {
    if (await isLikelyEgyptRelease(supabase, movie)) {
      movies.push(movie);
    }
  }

  // elCinema is the source of truth for a movie's Egypt release date when
  // it has one -- see src/lib/matching/egypt-release-date.ts. TMDB's
  // release_date remains the fallback for movies elCinema has no record of.
  const rows = [];
  for (const m of movies) {
    const egyptDate = await getEgyptReleaseDate(supabase, m.id, m.title);
    rows.push({
      tmdb_id: m.id,
      title: m.title,
      original_title: m.original_title,
      poster_path: m.poster_path,
      release_date: egyptDate || m.release_date || null,
      popularity: m.popularity,
    });
  }

  const { error } = await supabase.from('movies').upsert(rows, {
    onConflict: 'tmdb_id',
    ignoreDuplicates: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: movies.length, candidates: candidates.length });
}
