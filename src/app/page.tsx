import { createClient } from '@/lib/supabase/server';
import { MovieCard, type MovieCardData } from '@/components/MovieCard';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from('movies')
    .select(
      'id, title, release_date, poster_path, showtimes_cache(bookable, branches(name))',
    )
    .in('match_status', ['matched', 'unmatched'])
    .order('release_date', { ascending: true, nullsFirst: false });

  if (q) {
    query = query.ilike('title', `%${q}%`);
  }

  const { data: movies } = await query.limit(60);

  let watchedIds = new Set<string>();
  if (user) {
    const { data: watchlistRows } = await supabase
      .from('watchlist')
      .select('movie_id')
      .eq('user_id', user.id);
    watchedIds = new Set((watchlistRows ?? []).map((r) => r.movie_id));
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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display mb-2 text-5xl leading-none" style={{ color: 'var(--ink)' }}>
        Upcoming at the movies
      </h1>
      <p className="mb-8 max-w-xl text-sm" style={{ color: 'var(--ink-dim)' }}>
        Watchlist a title before it&apos;s even on Scene&apos;s site, and get notified the
        moment tickets go live at Cairo Festival City or District 5.
      </p>

      <form className="mb-8" action="/">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search movies..."
          className="w-full max-w-sm rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{
            borderColor: 'var(--rule)',
            background: 'var(--bg-elevated)',
            color: 'var(--ink)',
          }}
        />
      </form>

      {movieCards.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {movieCards.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              isWatchlisted={watchedIds.has(movie.id)}
              isSignedIn={!!user}
            />
          ))}
        </div>
      )}
    </main>
  );
}
