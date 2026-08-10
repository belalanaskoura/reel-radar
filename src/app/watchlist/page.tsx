import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TicketIcon } from '@/components/icons';
import { WatchlistGrid, type WatchedMovie } from '@/components/WatchlistGrid';
import { logPageView } from '@/lib/analytics';

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  logPageView('/watchlist');

  const { data: watchlistRows } = await supabase
    .from('watchlist')
    .select(
      `movie_id, movies (
        id, title, release_date, poster_path,
        movie_branch_slugs (branch_id, slug, branches (name)),
        showtimes_cache (branch_id, bookable, raw_showtimes, branches (name))
      )`,
    )
    .eq('user_id', user.id);

  const watchedMovies = (watchlistRows ?? [])
    .map((row) => row.movies as unknown as WatchedMovie | null)
    .filter((m): m is WatchedMovie => m !== null);

  return (
    <main>
      <div className="relative overflow-hidden border-b" style={{ borderColor: 'var(--rule)' }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
            >
              <TicketIcon />
            </div>
            <h1 className="font-display text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
              Your watchlist
            </h1>
          </div>
          <p className="max-w-xl text-sm sm:text-base" style={{ color: 'var(--ink-dim)' }}>
            Every title you&apos;re tracking, with live showtimes and a direct
            booking link the moment tickets go on sale.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <WatchlistGrid movies={watchedMovies} />
      </div>
    </main>
  );
}
