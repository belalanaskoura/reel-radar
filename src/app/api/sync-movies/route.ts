import { NextResponse } from 'next/server';
import { fetchUpcomingMovies } from '@/lib/tmdb';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Pulls upcoming movies from TMDB and upserts them into the `movies` table.
// Matched on tmdb_id so re-running is idempotent. Does not touch Scene
// Cinemas at all -- that's Phase 4/5.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const sixMonthsOut = new Date(today);
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);

  const fromDate = today.toISOString().slice(0, 10);
  const toDate = sixMonthsOut.toISOString().slice(0, 10);

  const movies = await fetchUpcomingMovies(fromDate, toDate);

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('movies').upsert(
    movies.map((m) => ({
      tmdb_id: m.id,
      title: m.title,
      original_title: m.original_title,
      poster_path: m.poster_path,
      release_date: m.release_date || null,
      popularity: m.popularity,
    })),
    { onConflict: 'tmdb_id', ignoreDuplicates: false },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: movies.length });
}
