'use client';

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { posterUrl } from '@/lib/tmdb-image';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { chainForBranch, voxBranchShowtimesUrl, type VoxBranchId } from '@/lib/branches';
import { SearchIcon, TicketIcon, TrashIcon } from '@/components/icons';
import { FilterDropdown, type StatusFilter } from '@/components/FilterDropdown';
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

// Same word-start matching as /browse's search (BrowseGrid.matchesSearch)
// -- kept as a separate local copy rather than a shared import since this
// page's search is local component state, not SearchProvider's context
// (that context is specifically for NavSearch <-> BrowseGrid, siblings
// with no direct prop connection; the watchlist page has no such need).
function matchesSearch(title: string, query: string): boolean {
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return true;
  const titleWords = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return queryWords.every((qWord) => titleWords.some((tWord) => tWord.startsWith(qWord)));
}

// Single primary booking link for the card's main action button: the
// first bookable branch's link, Scene or VOX. A movie bookable at
// several branches still only gets one button here (the full branch-by-
// branch breakdown is a tap away on the movie detail page) -- this card
// is a scannable list, not the place to reproduce that detail.
function primaryBookingUrl(movie: WatchedMovie): string | null {
  const bookableCache = movie.showtimes_cache.find((c) => c.bookable);
  if (!bookableCache) return null;
  if (chainForBranch(bookableCache.branch_id) === 'vox') {
    return voxBranchShowtimesUrl(bookableCache.branch_id as VoxBranchId);
  }
  const slugRow = movie.movie_branch_slugs.find((s) => s.branch_id === bookableCache.branch_id);
  return slugRow ? sceneMovieUrl(bookableCache.branch_id, slugRow.slug) : null;
}

export function WatchlistGrid({ movies }: { movies: WatchedMovie[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function handleRemove(movieId: string) {
    startTransition(async () => {
      setRemovedIds((prev) => new Set(prev).add(movieId));
      await removeFromWatchlist(movieId);
    });
  }

  const filteredMovies = useMemo(() => {
    let result = movies.filter((m) => !removedIds.has(m.id));

    if (statusFilter === 'bookable') {
      result = result.filter((m) => m.showtimes_cache.some((c) => c.bookable));
    } else if (statusFilter === 'coming_soon') {
      result = result.filter((m) => !m.showtimes_cache.some((c) => c.bookable));
    }

    if (query.trim()) {
      result = result.filter((m) => matchesSearch(m.title, query));
    }

    return result;
  }, [movies, removedIds, statusFilter, query]);

  // Movies with no known release date (the Arabic-title matching gap
  // flagged elsewhere in the app) don't have a meaningful "soonest" or
  // "latest" position, so they always sort last regardless of direction
  // rather than landing at one extreme or the other by accident of how
  // string comparison treats null.
  const sortedMovies = useMemo(() => {
    const withDate = filteredMovies.filter((m) => m.release_date);
    const withoutDate = filteredMovies.filter((m) => !m.release_date);
    withDate.sort((a, b) => {
      const cmp = a.release_date!.localeCompare(b.release_date!);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return [...withDate, ...withoutDate];
  }, [filteredMovies, sortDirection]);

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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            style={{ color: 'var(--ink-dim)' }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search watchlist..."
            className="min-h-11 w-full rounded-sm border py-2 pr-3 pl-9 text-sm focus:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
          <SortToggle value={sortDirection} onChange={setSortDirection} />
        </div>
      </div>

      {sortedMovies.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies match this filter.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {sortedMovies.map((movie) => {
            const isBookable = movie.showtimes_cache.some((c) => c.bookable);
            const bookingUrl = isBookable ? primaryBookingUrl(movie) : null;

            return (
              <div
                key={movie.id}
                className="poster-card flex flex-col overflow-hidden rounded-lg"
                style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
              >
                <div className="relative">
                  <Link
                    href={`/movies/${movie.id}`}
                    className="relative block aspect-[2/3] w-full overflow-hidden"
                    style={{ background: 'var(--listed-bg)' }}
                  >
                    {posterUrl(movie.poster_path) ? (
                      <Image
                        src={posterUrl(movie.poster_path)!}
                        alt={movie.title}
                        fill
                        sizes="(max-width: 640px) 50vw, 220px"
                        unoptimized
                        className="object-cover"
                      />
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleRemove(movie.id)}
                    aria-label="Remove from watchlist"
                    title="Remove from watchlist"
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-opacity hover:opacity-80"
                    style={{ background: 'color-mix(in srgb, var(--bg) 65%, transparent)', color: 'var(--ink)' }}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div>
                    <Link href={`/movies/${movie.id}`} className="hover:opacity-80">
                      <h2
                        className="font-display line-clamp-2 text-lg leading-tight uppercase"
                        style={{ color: 'var(--ink)' }}
                      >
                        {movie.title}
                      </h2>
                    </Link>
                    <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                      {movie.release_date
                        ? `${isBookable ? 'Released' : 'Release'}: ${movie.release_date}`
                        : 'Release date TBA'}
                    </p>
                  </div>

                  <p
                    className="flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: isBookable ? 'var(--accent)' : 'var(--ink-dim)' }}
                  >
                    <TicketIcon size={13} />
                    {isBookable ? 'Book Now' : 'Coming Soon'}
                  </p>

                  <div className="mt-auto pt-1">
                    {isBookable ? (
                      bookingUrl ? (
                        <a
                          href={bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full rounded-sm px-3 py-2 text-center text-xs font-semibold transition-opacity hover:opacity-90"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          View Showtimes
                        </a>
                      ) : (
                        <Link
                          href={`/movies/${movie.id}`}
                          className="block w-full rounded-sm px-3 py-2 text-center text-xs font-semibold transition-opacity hover:opacity-90"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          View Showtimes
                        </Link>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full cursor-not-allowed rounded-sm px-3 py-2 text-xs font-semibold"
                        style={{ background: 'var(--listed-bg)', color: 'var(--listed-ink)' }}
                      >
                        Coming Soon
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
