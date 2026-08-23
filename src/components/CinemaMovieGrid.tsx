'use client';

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { posterUrl } from '@/lib/tmdb-image';
import { getBranchShowtimesForDate } from '@/app/cinemas/[id]/actions';
import { FilterDropdown, type StatusFilter } from '@/components/FilterDropdown';
import { DateTabStrip } from '@/components/DateTabStrip';
import { FilmIcon } from '@/components/icons';

export interface CinemaMovie {
  id: string;
  title: string;
  poster_path: string | null;
  slug: string;
  bookable: boolean;
}

export interface CinemaDate {
  date: string; // dd-mm-yyyy, matching Scene's business_day param
  label: string; // e.g. "Thu, Oct 24"
}

export function CinemaMovieGrid({
  branchId,
  branchShortName,
  movies,
  dates,
  chain,
}: {
  branchId: string;
  branchShortName: string;
  movies: CinemaMovie[];
  dates: CinemaDate[];
  chain: 'scene' | 'vox';
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Per-date cache of movie IDs confirmed to have a showtime that day, so
  // switching back to a date already checked this session is instant
  // instead of re-running the whole fan-out fetch again. A date missing
  // from this map means "not fetched yet" (distinct from an entry that's
  // an empty Set, which means "fetched, and none of them do").
  const [resultsByDate, setResultsByDate] = useState<Record<string, Set<string>>>({});
  const [isPending, startTransition] = useTransition();
  const [dateError, setDateError] = useState(false);

  const movieIdsForDate = selectedDate ? (resultsByDate[selectedDate] ?? null) : null;

  function selectDate(date: string) {
    if (selectedDate === date) {
      // Selecting the same date again clears the filter back to "any date"
      setSelectedDate(null);
      return;
    }

    setSelectedDate(date);
    setDateError(false);

    if (resultsByDate[date]) return; // already cached, nothing to fetch

    const bookableMovies = movies
      .filter((m) => m.bookable)
      .map((m) => ({ movieId: m.id, slug: m.slug }));

    startTransition(async () => {
      try {
        const results = await getBranchShowtimesForDate(branchId, bookableMovies, date);
        setResultsByDate((prev) => ({
          ...prev,
          [date]: new Set(results.filter((r) => r.hasShowtime).map((r) => r.movieId)),
        }));
      } catch {
        setDateError(true);
      }
    });
  }

  const filtered = useMemo(() => {
    let result = movies;

    if (statusFilter === 'bookable') {
      result = result.filter((m) => m.bookable);
    } else if (statusFilter === 'coming_soon') {
      result = result.filter((m) => !m.bookable);
    }

    if (selectedDate && movieIdsForDate) {
      result = result.filter((m) => movieIdsForDate.has(m.id));
    }

    return result;
  }, [movies, statusFilter, selectedDate, movieIdsForDate]);

  return (
    <div className="flex flex-col gap-6">
      {chain === 'scene' && dates.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl tracking-wide uppercase" style={{ color: 'var(--ink)' }}>
            Select date
          </h2>
          <DateTabStrip dates={dates} selectedDate={selectedDate} onSelect={selectDate} />
          {isPending && (
            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              Checking {branchShortName} showtimes for this date&hellip;
            </p>
          )}
          {dateError && (
            <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
              Couldn&apos;t check showtimes for that date. Try again.
            </p>
          )}
          {!isPending && !dateError && selectedDate && movieIdsForDate && (
            <p className="text-xs" style={{ color: 'var(--accent)' }}>
              {movieIdsForDate.size === 0
                ? `No movies have a showtime on ${dates.find((d) => d.date === selectedDate)?.label}.`
                : `${movieIdsForDate.size} movie${movieIdsForDate.size === 1 ? '' : 's'} showing on ${dates.find((d) => d.date === selectedDate)?.label}.`}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-wide uppercase" style={{ color: 'var(--ink)' }}>
          Movies
        </h2>
        <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No movies match this filter.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((movie) => {
            const poster = posterUrl(movie.poster_path);
            return (
              <Link key={movie.id} href={`/movies/${movie.id}?from=${branchId}`} className="group flex flex-col gap-2">
                <div
                  className="relative aspect-[2/3] w-full overflow-hidden rounded-lg transition-transform duration-300 group-hover:scale-[1.02]"
                  style={{ background: 'var(--listed-bg)' }}
                >
                  {poster ? (
                    <Image src={poster} alt={movie.title} fill sizes="200px" unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center" style={{ color: 'var(--ink-dim)' }}>
                      <FilmIcon size={28} />
                    </div>
                  )}
                  <span
                    className="absolute top-2 right-2 rounded px-2 py-1 text-[10px] font-bold tracking-wider uppercase"
                    style={
                      movie.bookable
                        ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }
                    }
                  >
                    {movie.bookable ? 'Bookable' : 'Listed'}
                  </span>
                </div>
                <p
                  className="font-display line-clamp-2 text-sm leading-tight uppercase transition-opacity group-hover:opacity-80"
                  style={{ color: 'var(--ink)' }}
                >
                  {movie.title}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
