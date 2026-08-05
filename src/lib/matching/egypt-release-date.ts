import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchWorkDetails, searchElCinema, sleep, REQUEST_DELAY_MS } from '../elcinema/fetcher';
import { normalizeTitle } from './normalize';

// elCinema is the source of truth for a matched movie's Egypt release
// date -- TMDB's `release_date` is a single global value that can land on
// an unrelated country's date when TMDB has no EG release_dates entry at
// all (confirmed for real: "El Gawahergy" showed TMDB's Germany date,
// months off from elCinema's actual Egypt date). TMDB stays the fallback
// for movies elCinema has no record of.
//
// Checks the `egypt_releases` table (populated by the historical
// backfill) first; if the movie isn't there yet -- e.g. a brand-new
// release the 4-years-back backfill predates -- falls back to a live
// elCinema title search + work-page fetch, and caches the result into
// `egypt_releases` so the next lookup for this movie is free.
export async function getEgyptReleaseDate(
  supabase: SupabaseClient,
  tmdbId: number,
  title: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('egypt_releases')
    .select('release_date')
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (existing) return existing.release_date ?? null;

  try {
    const query = normalizeTitle(title);
    const results = await searchElCinema(query);
    await sleep(REQUEST_DELAY_MS);

    // elCinema's search ranking is not reliably exact-match-first --
    // confirmed for real: searching "runner" ranked "Runner Runner" above
    // the exact title "Runner", and a title with zero real elCinema
    // listing ("First Witch") still returned 25 unrelated "Witch" results.
    // Only trust a hit whose own title normalizes to the same query;
    // otherwise this is a movie elCinema has no record of, not a match.
    const exactMatch = results.find((r) => normalizeTitle(r.title) === query);
    if (!exactMatch) return null;

    const details = await fetchWorkDetails(exactMatch.elcinemaId);
    await sleep(REQUEST_DELAY_MS);

    await supabase.from('egypt_releases').upsert(
      {
        elcinema_id: details.elcinemaId,
        imdb_id: details.imdbId,
        tmdb_id: tmdbId,
        title: details.title,
        release_year: details.releaseYear,
        release_date: details.releaseDate,
        match_status: 'matched',
      },
      { onConflict: 'elcinema_id' },
    );

    return details.releaseDate;
  } catch {
    // elCinema unreachable/unexpected markup -- fall back to TMDB's date
    // rather than failing the whole sync/match run over a display detail.
    return null;
  }
}
