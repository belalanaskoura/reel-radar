import { createClient } from '@/lib/supabase/server';
import { BrowseGrid } from '@/components/BrowseGrid';
import { PushBanner } from '@/components/PushBanner';
import type { MovieCardData } from '@/components/MovieCard';

export default async function BrowsePage() {
  const supabase = await createClient();

  // Fetches every browsable movie once: search, the status filter, and
  // pagination all run client-side against this full set, so typing
  // filters instantly with no network round-trip per keystroke. Limit
  // raised well past the catalog's current size now that sync-movies
  // pulls through end of 2029 instead of 6 months out.
  //
  // 'ambiguous' rows (unresolved TMDB match) are fetched too, but only
  // kept below if they have a real showtimes_cache row -- an ambiguous
  // TMDB-only candidate with no Scene listing at all is still hidden
  // (no clean title to trust yet), but one Scene actually lists is a
  // real, physically-real movie: its title was never touched by the
  // failed TMDB match (findTmdbMatch only overwrites title/poster on a
  // confirmed match), so it's exactly the Scene-sourced title, safe to
  // show. Being listed on the real site is what matters most here.
  //
  // The movie catalog fetch doesn't depend on `user`, so it runs
  // concurrently with the auth check rather than waiting on it.
  const [
    {
      data: { user },
    },
    { data: movies },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('movies')
      .select('id, title, release_date, poster_path, match_status, showtimes_cache(branch_id, bookable, raw_showtimes, branches(name))')
      .in('match_status', ['matched', 'unmatched', 'ambiguous'])
      .order('release_date', { ascending: true, nullsFirst: false })
      .limit(2000),
  ]);

  const visibleMovies = (movies ?? []).filter(
    (m) => m.match_status !== 'ambiguous' || (m.showtimes_cache ?? []).length > 0,
  );

  let watchedIds: string[] = [];
  let showPushBanner = false;
  if (user) {
    const [{ data: watchlistRows }, { data: subscriptions }] = await Promise.all([
      supabase.from('watchlist').select('movie_id').eq('user_id', user.id),
      supabase.from('push_subscriptions').select('id').eq('user_id', user.id).limit(1),
    ]);
    watchedIds = (watchlistRows ?? []).map((r) => r.movie_id);
    showPushBanner = !subscriptions || subscriptions.length === 0;
  }

  const movieCards: MovieCardData[] = visibleMovies.map((m) => ({
    id: m.id,
    title: m.title,
    release_date: m.release_date,
    poster_path: m.poster_path,
    branches: (m.showtimes_cache ?? []).map((s) => ({
      branch_id: s.branch_id,
      branch_name: (s.branches as unknown as { name: string } | null)?.name ?? '',
      bookable: s.bookable,
      bookableDayCount: Array.isArray(s.raw_showtimes) ? s.raw_showtimes.length : 0,
    })),
  }));

  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] max-w-[200vw] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8">
        <h1
          className="font-display text-4xl leading-none tracking-wide uppercase sm:text-6xl lg:text-7xl"
          style={{ color: 'var(--ink)' }}
        >
          Now booking &amp; on the way
        </h1>

        {showPushBanner && (
          <div className="mt-6">
            <PushBanner />
          </div>
        )}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
        <BrowseGrid movies={movieCards} watchedIds={watchedIds} isSignedIn={!!user} />
      </div>
    </main>
  );
}
