import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMovieDetails, type TmdbMovie } from '../tmdb';

// A movie is shown only if a production company on it has actually
// released something in Egypt before (per the egypt_distributors table,
// built from ~4 years of real elCinema box office data; see
// scripts/backfill-egypt-releases.ts), or its popularity clears a
// safety-net threshold that catches new/first-time distributors and
// elCinema<->TMDB matching misses. No match on either -> excluded.
//
// Deliberately strict, not fallback-permissive: per explicit sign-off,
// a movie with no distributor match and popularity below the threshold
// is excluded outright, not shown with a lower-confidence label. This
// will produce false negatives (a genuinely-Egypt-bound movie from a
// brand-new distributor, or one this pipeline never matched), accepted as a
// tradeoff for a cleaner catalog.
const POPULARITY_SAFETY_NET = 50;

export async function isLikelyEgyptRelease(
  supabase: SupabaseClient,
  movie: TmdbMovie,
): Promise<boolean> {
  if (movie.popularity >= POPULARITY_SAFETY_NET) return true;

  const details = await fetchMovieDetails(movie.id);
  const companyIds = (details.production_companies ?? []).map((c) => c.id);
  if (companyIds.length === 0) return false;

  const { data } = await supabase
    .from('egypt_distributors')
    .select('tmdb_company_id')
    .in('tmdb_company_id', companyIds)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
