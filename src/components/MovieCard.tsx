import Image from 'next/image';
import Link from 'next/link';
import { posterUrl } from '@/lib/tmdb-image';
import { TicketIcon } from '@/components/icons';
import { MovieCardWatchlistButton } from '@/components/MovieCardWatchlistButton';

export interface MovieCardData {
  id: string;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  branches?: { branch_id: string; branch_name: string; bookable: boolean; bookableDayCount: number }[];
}

export function MovieCard({
  movie,
  isWatchlisted,
  isSignedIn,
}: {
  movie: MovieCardData;
  isWatchlisted: boolean;
  isSignedIn: boolean;
}) {
  const poster = posterUrl(movie.poster_path);
  const isBookable = movie.branches?.some((b) => b.bookable) ?? false;
  const isListed = (movie.branches?.length ?? 0) > 0;
  // Once bookable, adding to radar no longer serves its purpose -- the
  // whole point was to get notified of this transition, which has
  // already happened. Still let existing watchers remove it, though.
  const showWatchlistControl = isSignedIn && (isWatchlisted || !isBookable);

  return (
    <div
      data-movie-card
      className="poster-card flex flex-col overflow-hidden rounded-lg"
      style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
    >
      <div className="relative">
        <Link
          href={`/movies/${movie.id}`}
          className="group relative block aspect-[2/3] w-full overflow-hidden"
          style={{ background: 'var(--listed-bg)' }}
        >
          {poster ? (
            <Image
              src={poster}
              alt={movie.title}
              fill
              sizes="200px"
              unoptimized
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="flex h-full items-center justify-center px-3 text-center text-xs"
              style={{ color: 'var(--ink-dim)' }}
            >
              No poster yet
            </div>
          )}
        </Link>
        {showWatchlistControl && (
          <div className="absolute top-2 right-2">
            <MovieCardWatchlistButton movieId={movie.id} isWatchlisted={isWatchlisted} variant="icon" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        <div>
          <Link href={`/movies/${movie.id}`} className="block hover:opacity-80">
            <h3
              className="font-display line-clamp-1 text-lg leading-tight uppercase"
              style={{ color: 'var(--ink)' }}
            >
              {movie.title}
            </h3>
          </Link>
          <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
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
          {isBookable ? 'Book Now' : isListed ? 'Coming Soon' : 'Not Listed Yet'}
        </p>

        <div className="mt-auto pt-1">
          {isBookable ? (
            <Link
              href={`/movies/${movie.id}`}
              className="block w-full rounded-sm px-3 py-2 text-center text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              View Showtimes
            </Link>
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
}
