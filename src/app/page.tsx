import { createClient } from '@/lib/supabase/server';
import { MovieCard, type MovieCardData } from '@/components/MovieCard';
import { FilterDropdown, type StatusFilter } from '@/components/FilterDropdown';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const statusFilter: StatusFilter =
    status === 'bookable' || status === 'coming_soon' ? status : 'all';
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

  if (statusFilter === 'bookable') {
    movieCards = movieCards
      .filter((m) => m.branches?.some((b) => b.bookable))
      .map((m) => ({ ...m, branches: m.branches?.filter((b) => b.bookable) }));
  } else if (statusFilter === 'coming_soon') {
    // Listed at Scene (has branch entries) but not bookable at any of them --
    // distinct from movies not listed at Scene at all, which stay visible
    // under "All movies" but wouldn't make sense under this filter either.
    movieCards = movieCards.filter(
      (m) => m.branches && m.branches.length > 0 && !m.branches.some((b) => b.bookable),
    );
  }

  movieCards = movieCards.slice(0, 60);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display mb-2 text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
        Upcoming at the movies
      </h1>
      <p className="mb-6 max-w-xl text-sm sm:mb-8" style={{ color: 'var(--ink-dim)' }}>
        Watchlist a title before it&apos;s even on Scene&apos;s site, and get notified the
        moment tickets go live at Cairo Festival City or District 5.
      </p>

      <form className="mb-6 flex flex-wrap items-center gap-3 sm:mb-8" action="/">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search movies..."
          className="w-full min-w-0 flex-1 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 sm:max-w-sm sm:flex-none"
          style={{
            borderColor: 'var(--rule)',
            background: 'var(--bg-elevated)',
            color: 'var(--ink)',
          }}
        />
        <FilterDropdown current={statusFilter} />
      </form>

      {movieCards.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5">
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
