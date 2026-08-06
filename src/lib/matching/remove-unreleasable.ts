import type { SupabaseClient } from '@supabase/supabase-js';

// Removes movies whose release_date has passed while Scene never listed
// them on either branch (zero movie_branch_slugs rows) -- once that's
// true, the movie is never coming to Egypt cinemas: Scene would have
// created a page for it by its release date if it were. A movie Scene
// has listed (even if never bookable, i.e. still "coming soon" there)
// is left alone, since that's real evidence it's still expected.
//
// No movie_branch_slugs row also means no showtimes_cache/notification_log
// rows exist for it (both are only ever created alongside a slug), so the
// only other table that can reference it is watchlist -- deleted
// explicitly here rather than relying on an assumed FK cascade.
export async function removeUnreleasableMovies(
  supabase: SupabaseClient,
): Promise<{ removed: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: candidates, error: candidatesError } = await supabase
    .from('movies')
    .select('id, movie_branch_slugs(movie_id)')
    .lt('release_date', today);

  if (candidatesError) {
    throw new Error(`Failed to fetch unreleasable candidates: ${candidatesError.message}`);
  }

  const idsToRemove = (candidates ?? [])
    .filter((m) => (m.movie_branch_slugs as unknown[]).length === 0)
    .map((m) => m.id as string);

  if (idsToRemove.length === 0) {
    return { removed: 0 };
  }

  const { error: watchlistError } = await supabase
    .from('watchlist')
    .delete()
    .in('movie_id', idsToRemove);

  if (watchlistError) {
    throw new Error(`Failed to clear watchlist rows for unreleasable movies: ${watchlistError.message}`);
  }

  const { error: deleteError } = await supabase.from('movies').delete().in('id', idsToRemove);

  if (deleteError) {
    throw new Error(`Failed to delete unreleasable movies: ${deleteError.message}`);
  }

  return { removed: idsToRemove.length };
}
