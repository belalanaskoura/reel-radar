'use client';

import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
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

    // Movies bookable right now but with no known release date (Phase 5's
    // unresolved Arabic-title matching gap -- these still get real Scene
    // data, just no TMDB/elCinema date) would otherwise sort to the very
    // end alongside everything else with no date, even though they're
    // more actionable than anything with a future date. Server order
    // (ascending by release date, nulls last) is otherwise left alone.
    const bookableNoDate = (m: MovieCardData) =>
      !m.release_date && (m.branches?.some((b) => b.bookable) ?? false);
    if (result.some(bookableNoDate)) {
      result = [...result].sort((a, b) => Number(bookableNoDate(b)) - Number(bookableNoDate(a)));
    }

    return result;
  }, [movies, statusFilter, query]);

  // Changing search/filter can leave `page` pointing past the new result
  // set's end -- reset to page 1 whenever the filtered set changes rather
  // than showing an empty page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 sm:mb-8">
        <input
          type="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search movies..."
          className="w-full min-w-0 flex-1 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 sm:max-w-sm sm:flex-none"
          style={{
            borderColor: 'var(--rule)',
            background: 'var(--bg-elevated)',
            color: 'var(--ink)',
          }}
        />
        <FilterDropdown value={statusFilter} onChange={updateStatusFilter} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies found.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5">
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
