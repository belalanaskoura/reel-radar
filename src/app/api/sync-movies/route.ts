import { NextResponse } from 'next/server';
import { fetchUpcomingMovies } from '@/lib/tmdb';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isLikelyEgyptRelease } from '@/lib/matching/egypt-distributor-filter';
import { getEgyptReleaseInfo } from '@/lib/matching/egypt-release-date';
import { normalizeTitle } from '@/lib/matching/normalize';

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

  // elCinema is the source of truth for a movie's Egypt release date and
  // (as a fallback when TMDB has none) its poster -- see
  // src/lib/matching/egypt-release-date.ts. TMDB remains the fallback
  // for movies elCinema has no record of, for both fields.
  const rows = [];
  for (const m of movies) {
    const egyptInfo = await getEgyptReleaseInfo(supabase, m.id, m.title);
    rows.push({
      tmdb_id: m.id,
      title: m.title,
      original_title: m.original_title,
      poster_path: m.poster_path || egyptInfo.posterUrl || null,
      release_date: egyptInfo.releaseDate || m.release_date || null,
      popularity: m.popularity,
    });
  }

  // TMDB itself occasionally has two distinct tmdb_ids for the same real
  // movie (confirmed for real: "aks seir" existed as both 1728650 and
  // 1728604 -- same director/writer/cast/release date, one just a
  // sparser duplicate entry). `onConflict: 'tmdb_id'` only catches
  // re-syncing the *same* tmdb_id, so a same-title-and-date candidate
  // with a *different* tmdb_id is checked against already-stored movies
  // and skipped here -- scoped narrowly to an exact normalized-title +
  // exact release_date match (not fuzzy), since two genuinely different
  // movies sharing both is effectively never real, while a broader/fuzzy
  // match risks merging unrelated films.
  const dedupedRows = [];
  let skippedDuplicates = 0;
  for (const row of rows) {
    if (!row.release_date) {
      dedupedRows.push(row);
      continue;
    }

    const { data: sameDateMovies } = await supabase
      .from('movies')
      .select('tmdb_id, title')
      .eq('release_date', row.release_date)
      .neq('tmdb_id', row.tmdb_id)
      .not('tmdb_id', 'is', null);

    const normalizedTitle = normalizeTitle(row.title);
    const isDuplicate = (sameDateMovies ?? []).some(
      (existing) => normalizeTitle(existing.title) === normalizedTitle,
    );

    if (isDuplicate) {
      skippedDuplicates += 1;
    } else {
      dedupedRows.push(row);
    }
  }

  const { error } = await supabase.from('movies').upsert(dedupedRows, {
    onConflict: 'tmdb_id',
    ignoreDuplicates: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    synced: dedupedRows.length,
    candidates: candidates.length,
    skippedDuplicates,
  });
}
