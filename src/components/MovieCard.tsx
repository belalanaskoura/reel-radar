import Image from 'next/image';
import Link from 'next/link';
import { posterUrl } from '@/lib/tmdb-image';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

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
  // Once bookable, adding to a watchlist no longer serves its purpose --
  // the whole point was to get notified of this transition, which has
  // already happened. Still let existing watchers remove it, though.
  const showWatchlistControl = isSignedIn && (isWatchlisted || !isBookable);

  return (
    <div
      className="poster-card group relative flex flex-col gap-3 rounded-lg p-2"
      style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
    >
      <Link
        href={`/movies/${movie.id}`}
        className="absolute inset-0 z-0 rounded-lg"
        aria-label={movie.title}
      />
      <div className="pointer-events-none relative aspect-[2/3] w-full overflow-hidden rounded-md" style={{ background: 'var(--listed-bg)' }}>
        {poster ? (
          <Image
            src={poster}
            alt={movie.title}
            fill
            sizes="200px"
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
        {isListed && (
          <span
            className="absolute top-2 right-2 rounded px-2 py-1 text-[10px] font-bold tracking-wider uppercase"
            style={
              isBookable
                ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                : { background: 'var(--listed-bg)', color: 'var(--listed-ink)' }
            }
          >
            {isBookable ? 'Bookable' : 'Listed'}
          </span>
        )}
      </div>
      <div className="pointer-events-none relative flex flex-col gap-1 px-1 pb-1">
        <h3
          className="font-display line-clamp-2 text-lg leading-tight uppercase"
          style={{ color: 'var(--ink)' }}
        >
          {movie.title}
        </h3>
        {(movie.release_date || !isBookable) && (
          <p className="text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
            {movie.release_date
              ? `${isBookable ? 'Released on' : 'Release Date'} ${movie.release_date}`
              : 'Release date TBA'}
          </p>
        )}

        {!isListed && (
          <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
            Not listed yet
          </p>
        )}

        {showWatchlistControl && (
          <form
            action={
              isWatchlisted
                ? removeFromWatchlist.bind(null, movie.id)
                : addToWatchlist.bind(null, movie.id)
            }
            className="relative z-10 mt-2 pointer-events-auto"
          >
            <button
              type="submit"
              className="w-full rounded-sm border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={
                isWatchlisted
                  ? { borderColor: 'var(--rule)', color: 'var(--ink-dim)', background: 'transparent' }
                  : { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
              }
            >
              {isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
