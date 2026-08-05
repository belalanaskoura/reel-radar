'use client';

import { useMemo, useState } from 'react';
import { MovieCard, type MovieCardData } from '@/components/MovieCard';
import { FilterDropdown, type StatusFilter } from '@/components/FilterDropdown';

// Matches each word of the query independently rather than the whole
// string as one literal substring -- otherwise "Avengers Doomsday" (a
// space where the real title has a colon, "Avengers: Doomsday") fails to
// match even though every word is present.
function matchesSearch(title: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const lowerTitle = title.toLowerCase();
  return words.every((word) => lowerTitle.includes(word));
}

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

    return result.slice(0, 60);
  }, [movies, statusFilter, query]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 sm:mb-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies..."
          className="w-full min-w-0 flex-1 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 sm:max-w-sm sm:flex-none"
          style={{
            borderColor: 'var(--rule)',
            background: 'var(--bg-elevated)',
            color: 'var(--ink)',
          }}
        />
        <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              isWatchlisted={watchedIdSet.has(movie.id)}
              isSignedIn={isSignedIn}
            />
          ))}
        </div>
      )}
    </>
  );
}
