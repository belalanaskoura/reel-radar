import { createClient } from '@/lib/supabase/server';
import { BrowseGrid } from '@/components/BrowseGrid';
import type { MovieCardData } from '@/components/MovieCard';

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetches every browsable movie once -- search and the status filter
  // both run client-side against this full set (~100 movies at this
  // project's scale), so typing filters instantly with no network
  // round-trip per keystroke.
  const { data: movies } = await supabase
    .from('movies')
    .select('id, title, release_date, poster_path, showtimes_cache(bookable, branches(name))')
    .in('match_status', ['matched', 'unmatched'])
    .order('release_date', { ascending: true, nullsFirst: false })
    .limit(500);

  let watchedIds: string[] = [];
  if (user) {
    const { data: watchlistRows } = await supabase
      .from('watchlist')
      .select('movie_id')
      .eq('user_id', user.id);
    watchedIds = (watchlistRows ?? []).map((r) => r.movie_id);
  }

  const movieCards: MovieCardData[] = (movies ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    release_date: m.release_date,
    poster_path: m.poster_path,
    branches: (m.showtimes_cache ?? []).map((s) => ({
      branch_name: (s.branches as unknown as { name: string } | null)?.name ?? '',
      bookable: s.bookable,
    })),
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display mb-2 text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
        Upcoming at the movies
      </h1>
      <p className="mb-6 max-w-xl text-sm sm:mb-8" style={{ color: 'var(--ink-dim)' }}>
        Watchlist a title before it&apos;s even on Scene&apos;s site, and get notified the
        moment tickets go live at Cairo Festival City or District 5.
      </p>

      <BrowseGrid movies={movieCards} watchedIds={watchedIds} isSignedIn={!!user} />
    </main>
  );
}
