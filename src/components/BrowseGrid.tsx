'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MovieCard, type MovieCardData } from '@/components/MovieCard';
import { FilterDropdown, type StatusFilter } from '@/components/FilterDropdown';

// Matches each word of the query independently against the start of any
// word in the title -- not a substring search. This does two things at
// once: (1) "I" matches "Iron Maiden" but not "Obsession" (which merely
// contains an "i"), and (2) splitting the title on non-letter characters
// means "Avengers Doomsday" (space) still matches "Avengers: Doomsday"
// (colon), since both produce the same word list.
function matchesSearch(title: string, query: string): boolean {
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return true;
  const titleWords = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return queryWords.every((qWord) => titleWords.some((tWord) => tWord.startsWith(qWord)));
}

const PAGE_SIZE = 60;

export function BrowseGrid({
  movies,
  watchedIds,
  isSignedIn,
}: {
  movies: MovieCardData[];
  watchedIds: string[];
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search lives in the URL (?q=), written by the nav bar's search input
  // (NavSearch) -- rendered separately, above this component in the
  // tree, with no direct prop connection to it. Reading it here keeps
  // both in sync without lifting state through a shared parent.
  const query = searchParams.get('q') ?? '';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const watchedIdSet = useMemo(() => new Set(watchedIds), [watchedIds]);

  const filtered = useMemo(() => {
    let result = movies;

    if (statusFilter === 'bookable') {
      result = result
        .filter((m) => m.branches?.some((b) => b.bookable))
        .map((m) => ({ ...m, branches: m.branches?.filter((b) => b.bookable) }));
    } else if (statusFilter === 'coming_soon') {
      // Listed at Scene (has branch entries) but not bookable at any of
      // them -- distinct from movies not listed at Scene at all, which
      // stay visible under "All movies" but wouldn't fit this filter either.
      result = result.filter(
        (m) => m.branches && m.branches.length > 0 && !m.branches.some((b) => b.bookable),
      );
    }

    if (query.trim()) {
      result = result.filter((m) => matchesSearch(m.title, query));
    }

    // Bookable movies lead the whole list -- you can act on them today,
    // which matters more than a future release date. Within each of the
    // two groups (bookable / not-yet-released), the server's ascending
    // release-date order is preserved via a stable sort, so this only
    // splits the existing order into two blocks rather than re-deriving
    // it. A bookable movie with no known release date (Phase 5's
    // unresolved Arabic-title matching gap) still sorts within the
    // bookable block, just after any bookable movie that does have a date.
    const isBookable = (m: MovieCardData) => m.branches?.some((b) => b.bookable) ?? false;
    result = [...result].sort((a, b) => Number(isBookable(b)) - Number(isBookable(a)));

    return result;
  }, [movies, statusFilter, query]);

  // Page number lives in the URL too (?page=), not local state -- a new
  // search (written by NavSearch, a sibling with no direct prop
  // connection to this component) always omits ?page, which naturally
  // reads back as page 1 here without needing a separate reset effect.
  const pageParam = Number(searchParams.get('page'));
  const requestedPage = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) {
      params.set('page', String(nextPage));
    } else {
      params.delete('page');
    }
    router.replace(params.size > 0 ? `/?${params}` : '/', { scroll: false });
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    goToPage(1);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          {query.trim() ? (
            <>
              {filtered.length} result{filtered.length === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
            </>
          ) : (
            <>{filtered.length} movies</>
          )}
        </p>
        <FilterDropdown value={statusFilter} onChange={updateStatusFilter} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies found.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {pageItems.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                isWatchlisted={watchedIdSet.has(movie.id)}
                isSignedIn={isSignedIn}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
              >
                Previous
              </button>
              <span className="text-sm tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
