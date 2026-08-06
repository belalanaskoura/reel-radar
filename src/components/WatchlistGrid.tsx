'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { posterUrl } from '@/lib/tmdb-image';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { TicketIcon, TrashIcon } from '@/components/icons';
import { SortToggle, type SortDirection } from '@/components/SortToggle';
import { removeFromWatchlist } from '@/app/watchlist/actions';

export interface WatchedMovie {
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

export function WatchlistGrid({ movies }: { movies: WatchedMovie[] }) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Movies with no known release date (the Arabic-title matching gap
  // flagged elsewhere in the app) don't have a meaningful "soonest" or
  // "latest" position, so they always sort last regardless of direction
  // rather than landing at one extreme or the other by accident of how
  // string comparison treats null.
  const sortedMovies = useMemo(() => {
    const withDate = movies.filter((m) => m.release_date);
    const withoutDate = movies.filter((m) => !m.release_date);
    withDate.sort((a, b) => {
      const cmp = a.release_date!.localeCompare(b.release_date!);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return [...withDate, ...withoutDate];
  }, [movies, sortDirection]);

  if (movies.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-sm border py-16 text-center"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--listed-bg)', color: 'var(--ink-dim)' }}
        >
          <TicketIcon size={22} />
        </div>
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          Nothing here yet.
        </p>
        <Link
          href="/browse"
          className="rounded-sm px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Browse movies
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <SortToggle value={sortDirection} onChange={setSortDirection} />
      </div>

      <ul className="flex flex-col gap-4">
        {sortedMovies.map((movie) => {
          const isBookable = movie.showtimes_cache.some((c) => c.bookable);
          return (
          <li
            key={movie.id}
            className="poster-card flex gap-4 rounded-sm border p-4"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
          >
            <Link
              href={`/movies/${movie.id}`}
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
            </Link>

            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/movies/${movie.id}`} className="hover:opacity-80">
                    <h2 className="font-display text-2xl leading-tight" style={{ color: 'var(--ink)' }}>
                      {movie.title}
                    </h2>
                  </Link>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                    {movie.release_date
                      ? `${isBookable ? 'Released on' : 'Release Date'} ${movie.release_date}`
                      : 'Release date TBA'}
                  </p>
                </div>
                <form action={removeFromWatchlist.bind(null, movie.id)}>
                  <button
                    type="submit"
                    aria-label="Remove from watchlist"
                    title="Remove from watchlist"
                    className="rounded-sm border p-1.5 transition-opacity hover:opacity-70"
                    style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
                  >
                    <TrashIcon />
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
          );
        })}
      </ul>
    </>
  );
}
