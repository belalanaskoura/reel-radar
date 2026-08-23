import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CinemaIcon } from '@/components/icons';
import { RadarLogo } from '@/components/RadarLogo';
import { WatchlistGrid, type WatchedMovie } from '@/components/WatchlistGrid';
import { CinemaFollowButton } from '@/components/CinemaFollowButton';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { logPageView } from '@/lib/analytics';

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  logPageView('/watchlist');

  const [{ data: watchlistRows }, { data: followRows }, { data: profile }] = await Promise.all([
    supabase
      .from('watchlist')
      .select(
        `movie_id, movies (
          id, title, release_date, poster_path,
          movie_branch_slugs (branch_id, slug, branches (name)),
          showtimes_cache (branch_id, bookable, raw_showtimes, branches (name))
        )`,
      )
      .eq('user_id', user.id),
    supabase.from('cinema_follows').select('branch_id, branches (id, name)').eq('user_id', user.id),
    supabase.from('profiles').select('watchlist_booking_click_action').eq('id', user.id).single(),
  ]);

  const watchedMovies = (watchlistRows ?? [])
    .map((row) => row.movies as unknown as WatchedMovie | null)
    .filter((m): m is WatchedMovie => m !== null);

  const followedCinemas = (followRows ?? [])
    .map((row) => row.branches as unknown as { id: string; name: string } | null)
    .filter((b): b is { id: string; name: string } => b !== null);

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
            <RadarLogo size={30} />
            <h1 className="font-display text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
              Your watchlist
            </h1>
          </div>
          <p className="max-w-xl text-sm sm:text-base" style={{ color: 'var(--ink-dim)' }}>
            {watchedMovies.length > 0
              ? `Tracking ${watchedMovies.length} title${watchedMovies.length === 1 ? '' : 's'}, with live showtimes and a direct booking link the moment tickets go on sale.`
              : "Every title you're tracking, with live showtimes and a direct booking link the moment tickets go on sale."}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {followedCinemas.length > 0 && (
          <div className="mb-6">
            <CollapsibleSection
              title="Tracked cinemas"
              description={`${followedCinemas.length} branch${followedCinemas.length === 1 ? '' : 'es'}`}
              icon={<CinemaIcon size={20} />}
              defaultOpen={followedCinemas.length <= 2}
            >
              <div className="flex flex-col gap-2">
                {followedCinemas.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between gap-3 rounded-lg p-3"
                    style={{ background: 'var(--bg)', boxShadow: '0 0 0 1px var(--rule)' }}
                  >
                    <Link
                      href={`/cinemas/${branch.id}`}
                      className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
                    >
                      <CinemaIcon size={18} style={{ color: 'var(--accent)' }} />
                      <span className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {branch.name}
                      </span>
                    </Link>
                    <CinemaFollowButton branchId={branch.id} isFollowing />
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}

        <WatchlistGrid
          movies={watchedMovies}
          initialBookingClickAction={profile?.watchlist_booking_click_action ?? 'ask'}
        />
      </div>
    </main>
  );
}
