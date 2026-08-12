import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTitle } from './normalize';
import { titleSimilarity } from './title-similarity';

const FUZZY_MATCH_THRESHOLD = 0.8;

// Single source of truth for "does a movie with this title already exist,"
// used by both scrapers (before creating a new placeholder) and the
// reconciliation pass in merge-scene-duplicates.ts (before leaving a
// placeholder unmerged). Searches the entire `movies` table by default --
// any match_status, any tmdb_id -- unlike mergeSceneDuplicates/
// matchScenesToTmdb, which only ever look at tmdb_id IS NULL rows. That
// narrower scope is exactly the gap that let TMDB-sourced rows (from
// sync-movies) sit unmerged next to freshly-scraped Scene/VOX placeholders
// indefinitely. Exact normalized-title match wins outright; fuzzy is only
// consulted when no exact match exists, same ordering/reasoning as
// mergeSceneDuplicates' two-pass approach.
//
// Pass placeholdersOnly: true when the caller is about to repoint the
// match onto a specific tmdb_id (sync-movies) -- searching the full table
// there would risk matching an already-matched row that happens to share
// a normalized title with a different real movie (rare, but the fuzzy
// pass in particular isn't a safe basis for silently overwriting another
// row's tmdb_id) and clobbering its existing tmdb_id.
export async function findExistingMovieByTitle(
  supabase: SupabaseClient,
  title: string,
  options?: { excludeId?: string; placeholdersOnly?: boolean },
): Promise<string | null> {
  const key = normalizeTitle(title);
  if (!key) return null;

  let query = supabase.from('movies').select('id, title, created_at').order('created_at', { ascending: true });
  if (options?.placeholdersOnly) {
    query = query.is('tmdb_id', null);
  }
  const { data: candidates, error } = await query;

  if (error) throw new Error(`Failed to load movies for title lookup: ${error.message}`);
  if (!candidates || candidates.length === 0) return null;

  const excludeId = options?.excludeId;

  const pool = excludeId ? candidates.filter((m) => m.id !== excludeId) : candidates;

  for (const movie of pool) {
    if (normalizeTitle(movie.title) === key) return movie.id;
  }

  for (const movie of pool) {
    if (titleSimilarity(key, normalizeTitle(movie.title)) >= FUZZY_MATCH_THRESHOLD) {
      return movie.id;
    }
  }

  return null;
}
