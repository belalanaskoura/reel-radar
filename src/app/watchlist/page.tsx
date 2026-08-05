import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { addToWatchlist, removeFromWatchlist } from './actions';

// Minimal watchlist management -- enough to prove Phase 6's watchlist +
// polling + notify-once loop end to end. Real browse/search UI is Phase 7.
export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  const { data: watchlistRows } = await supabase
    .from('watchlist')
    .select('movie_id')
    .eq('user_id', user.id);
  const watchedIds = new Set((watchlistRows ?? []).map((r) => r.movie_id));

  const { data: movies } = await supabase
    .from('movies')
    .select('id, title, release_date')
    .eq('match_status', 'matched')
    .order('release_date', { ascending: true });

  return (
    <main>
      <h1>Watchlist</h1>
      <ul>
        {(movies ?? []).map((movie) => (
          <li key={movie.id}>
            {movie.title} ({movie.release_date})
            {watchedIds.has(movie.id) ? (
              <form action={removeFromWatchlist.bind(null, movie.id)} style={{ display: 'inline' }}>
                <button type="submit">Remove from watchlist</button>
              </form>
            ) : (
              <form action={addToWatchlist.bind(null, movie.id)} style={{ display: 'inline' }}>
                <button type="submit">Add to watchlist</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
