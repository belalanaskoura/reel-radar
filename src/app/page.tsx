import { createClient } from '@/lib/supabase/server';
import { MovieCard, type MovieCardData } from '@/components/MovieCard';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bookable?: string }>;
}) {
  const { q, bookable } = await searchParams;
  const bookableOnly = bookable === '1';
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

  const { data: movies } = await query.limit(200);

  let watchedIds = new Set<string>();
  if (user) {
    const { data: watchlistRows } = await supabase
      .from('watchlist')
      .select('movie_id')
      .eq('user_id', user.id);
    watchedIds = new Set((watchlistRows ?? []).map((r) => r.movie_id));
  }

  let movieCards: MovieCardData[] = (movies ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    release_date: m.release_date,
    poster_path: m.poster_path,
    branches: (m.showtimes_cache ?? []).map((s) => ({
      branch_name: (s.branches as unknown as { name: string } | null)?.name ?? '',
      bookable: s.bookable,
    })),
  }));

  if (bookableOnly) {
    movieCards = movieCards
      .filter((m) => m.branches?.some((b) => b.bookable))
      .map((m) => ({ ...m, branches: m.branches?.filter((b) => b.bookable) }));
  }

  movieCards = movieCards.slice(0, 60);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display mb-2 text-5xl leading-none" style={{ color: 'var(--ink)' }}>
        Upcoming at the movies
      </h1>
      <p className="mb-8 max-w-xl text-sm" style={{ color: 'var(--ink-dim)' }}>
        Watchlist a title before it&apos;s even on Scene&apos;s site, and get notified the
        moment tickets go live at Cairo Festival City or District 5.
      </p>

      <form className="mb-8 flex flex-wrap items-center gap-4" action="/">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
          <input
            type="checkbox"
            name="bookable"
            value="1"
            defaultChecked={bookableOnly}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Bookable now
        </label>
        <button
          type="submit"
          className="rounded-sm border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
        >
          Apply
        </button>
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
