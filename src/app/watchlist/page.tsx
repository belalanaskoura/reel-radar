import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { posterUrl } from '@/lib/tmdb-image';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { removeFromWatchlist } from './actions';

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display mb-8 text-5xl leading-none" style={{ color: 'var(--ink)' }}>
        Your watchlist
      </h1>

      {watchedMovies.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          Nothing here yet.{' '}
          <Link href="/" className="underline" style={{ color: 'var(--accent)' }}>
            Browse upcoming movies
          </Link>{' '}
          to add some.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {watchedMovies.map((movie) => (
            <li
              key={movie.id}
              className="flex gap-4 rounded-sm border p-4"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
            >
              <div
                className="relative h-36 w-24 flex-shrink-0 overflow-hidden rounded-sm"
                style={{ background: 'var(--listed-bg)' }}
              >
                {posterUrl(movie.poster_path) ? (
                  <Image
                    src={posterUrl(movie.poster_path)!}
                    alt={movie.title}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-2xl leading-tight" style={{ color: 'var(--ink)' }}>
                      {movie.title}
                    </h2>
                    <p className="text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                      {movie.release_date ?? 'Release date TBA'}
                    </p>
                  </div>
                  <form action={removeFromWatchlist.bind(null, movie.id)}>
                    <button
                      type="submit"
                      className="rounded-sm border px-2 py-1 text-xs transition-opacity hover:opacity-70"
                      style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
                    >
                      Remove
                    </button>
                  </form>
                </div>

                {movie.showtimes_cache.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                    Not yet listed at Scene
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {movie.showtimes_cache.map((cache) => {
                      const slugRow = movie.movie_branch_slugs.find(
                        (s) => s.branch_id === cache.branch_id,
                      );
                      const branchName = cache.branches?.name ?? cache.branch_id;
                      return (
                        <li key={cache.branch_id} className="text-xs">
                          <span className="font-medium" style={{ color: 'var(--ink)' }}>
                            {branchName}:
                          </span>{' '}
                          {cache.bookable ? (
                            <>
                              <span style={{ color: 'var(--ok-ink)' }}>Bookable</span>
                              {Array.isArray(cache.raw_showtimes) &&
                                cache.raw_showtimes.length > 0 && (
                                  <span className="tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                                    {' '}
                                    ({cache.raw_showtimes.join(', ')})
                                  </span>
                                )}
                              {slugRow && (
                                <a
                                  href={sceneMovieUrl(cache.branch_id, slugRow.slug)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 underline"
                                  style={{ color: 'var(--accent)' }}
                                >
                                  Book now
                                </a>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--ink-dim)' }}>Listed, not bookable yet</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

interface WatchedMovie {
  id: string;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  movie_branch_slugs: { branch_id: string; slug: string; branches: { name: string } | null }[];
  showtimes_cache: {
    branch_id: string;
    bookable: boolean;
    raw_showtimes: unknown;
    branches: { name: string } | null;
  }[];
}

function sceneMovieUrl(branchId: string, slug: string): string {
  return `${BRANCH_BASE_URLS[branchId as BranchId] ?? ''}/movie-details/${slug}.html`;
}
