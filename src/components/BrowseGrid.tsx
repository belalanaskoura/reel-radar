'use client';

import { useMemo, useState } from 'react';
import { MovieCard, type MovieCardData } from '@/components/MovieCard';
import { FilterDropdown, type StatusFilter } from '@/components/FilterDropdown';
import { CinemaFilterDropdown, type CinemaOption } from '@/components/CinemaFilterDropdown';
import { useSearchQuery } from '@/components/SearchProvider';
import { useEqualRowHeights } from '@/components/useEqualRowHeights';

// Matches each word of the query independently against the start of any
// word in the title, not a substring search. This does two things at
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
  cinemas,
}: {
  movies: MovieCardData[];
  watchedIds: string[];
  isSignedIn: boolean;
  cinemas: CinemaOption[];
}) {
  // Search lives in SearchProvider's context, written by the nav bar's
  // search input (NavSearch), rendered separately, above this component
  // in the tree, with no direct prop connection to it. Reading it here
  // keeps both in sync without lifting state through a shared parent or
  // triggering a navigation per keystroke (see SearchProvider).
  const { query } = useSearchQuery();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [cinemaFilter, setCinemaFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const watchedIdSet = useMemo(() => new Set(watchedIds), [watchedIds]);

  const filtered = useMemo(() => {
    let result = movies;

    if (statusFilter === 'bookable') {
      result = result
        .filter((m) => m.branches?.some((b) => b.bookable))
        .map((m) => ({ ...m, branches: m.branches?.filter((b) => b.bookable) }));
    } else if (statusFilter === 'coming_soon') {
      // Listed at Scene (has branch entries) but not bookable at any of
      // them; distinct from movies not listed at Scene at all, which
      // stay visible under "All movies" but wouldn't fit this filter either.
      result = result.filter(
        (m) => m.branches && m.branches.length > 0 && !m.branches.some((b) => b.bookable),
      );
    }

    if (cinemaFilter) {
      result = result.filter((m) => m.branches?.some((b) => b.branch_id === cinemaFilter));
    }

    if (query.trim()) {
      result = result.filter((m) => matchesSearch(m.title, query));
    }

    // Bookable movies lead the whole list: you can act on them today,
    // which matters more than a future release date. Within the bookable
    // group, more bookable days (summed across branches) sorts first --
    // a proxy for how widely a movie is actually showing right now, using
    // the day-level data already cached in showtimes_cache.raw_showtimes
    // rather than fetching live per-day showtime counts, which would mean
    // a Scene request per movie per browse page view. Within the
    // not-yet-bookable group, the server's ascending release-date order
    // is preserved via a stable sort. A bookable movie with no known
    // release date (Phase 5's unresolved Arabic-title matching gap)
    // still sorts within the bookable block, ordered by its day count
    // like any other bookable movie.
    const isBookable = (m: MovieCardData) => m.branches?.some((b) => b.bookable) ?? false;
    const bookableDayCount = (m: MovieCardData) =>
      (m.branches ?? []).reduce((sum, b) => sum + (b.bookable ? b.bookableDayCount : 0), 0);
    result = [...result].sort((a, b) => {
      const bookableDiff = Number(isBookable(b)) - Number(isBookable(a));
      if (bookableDiff !== 0) return bookableDiff;
      if (isBookable(a) && isBookable(b)) return bookableDayCount(b) - bookableDayCount(a);
      return 0;
    });

    return result;
  }, [movies, statusFilter, cinemaFilter, query]);

  // "Load More" appends in place rather than paging, so how many items
  // are currently visible is local UI state, not something worth
  // round-tripping through the URL the way search/filter are. Reset back
  // to one page's worth whenever query or statusFilter change (a new
  // search is typed into NavSearch -- a sibling with no direct prop
  // connection to this component, so comparing against the previous
  // render's values, React's documented pattern for adjusting state
  // during render, is how this component notices without an effect) so
  // switching filters doesn't leave a previous search's worth of extra
  // rows rendered against a possibly much smaller new result set.
  const [prevFilterKey, setPrevFilterKey] = useState(`${query}:${statusFilter}:${cinemaFilter}`);
  const filterKey = `${query}:${statusFilter}:${cinemaFilter}`;
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Re-measures whenever the visible set changes (a new search/filter,
  // or "load more" appending rows) or the grid's own size changes (a
  // breakpoint's column count switching, or the window resizing) --
  // see the hook's own comment for why row membership can't be computed
  // once.
  const gridRef = useEqualRowHeights<HTMLDivElement>('data-movie-card', [visibleItems.length]);

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
  }

  return (
    <>
      <div
        className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4 sm:mb-8"
        style={{ borderColor: 'color-mix(in srgb, var(--ink) 5%, transparent)' }}
      >
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          {query.trim() ? (
            <>
              {filtered.length} result{filtered.length === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
            </>
          ) : (
            <>{filtered.length} movies</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <CinemaFilterDropdown cinemas={cinemas} value={cinemaFilter} onChange={setCinemaFilter} />
          <FilterDropdown value={statusFilter} onChange={updateStatusFilter} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies found.
        </p>
      ) : (
        <>
          <div
            ref={gridRef}
            className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {visibleItems.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                isWatchlisted={watchedIdSet.has(movie.id)}
                isSignedIn={isSignedIn}
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-10 flex justify-center sm:mt-12">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="min-h-11 rounded px-8 py-3 text-xs font-bold tracking-widest uppercase transition-all hover:opacity-90"
                style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 0 0 1px var(--rule)' }}
              >
                Load more titles
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
