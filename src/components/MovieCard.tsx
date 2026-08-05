import Image from 'next/image';
import Link from 'next/link';
import { posterUrl } from '@/lib/tmdb-image';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

export interface MovieCardData {
  id: string;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  branches?: { branch_name: string; bookable: boolean; bookableDayCount: number }[];
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
  // Once bookable, adding to a watchlist no longer serves its purpose --
  // the whole point was to get notified of this transition, which has
  // already happened. Still let existing watchers remove it, though.
  const showWatchlistControl = isSignedIn && (isWatchlisted || !isBookable);

  return (
    <div
      className="poster-card flex flex-col overflow-hidden rounded-sm shadow-sm"
      style={{ background: 'var(--bg-elevated)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
    >
      <Link href={`/movies/${movie.id}`} className="contents">
        <div className="relative aspect-[2/3] w-full" style={{ background: 'var(--listed-bg)' }}>
          {poster ? (
            <Image src={poster} alt={movie.title} fill sizes="200px" className="object-cover" />
          ) : (
            <div
              className="flex h-full items-center justify-center px-3 text-center text-xs"
              style={{ color: 'var(--ink-dim)' }}
            >
              No poster yet
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-col gap-2 p-3">
        <Link href={`/movies/${movie.id}`} className="hover:opacity-80">
          <h3
            className="font-display line-clamp-2 text-lg leading-tight"
            style={{ color: 'var(--ink)' }}
          >
            {movie.title}
          </h3>
        </Link>
        {(movie.release_date || !isBookable) && (
          <p className="text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
            {movie.release_date ?? 'Release date TBA'}
          </p>
        )}

        {movie.branches && movie.branches.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {movie.branches.map((b) => (
              <li
                key={b.branch_name}
                className="rounded-sm px-2 py-0.5 text-[11px] font-medium"
                style={
                  b.bookable
                    ? { background: 'var(--ok-bg)', color: 'var(--ok-ink)' }
                    : { background: 'var(--listed-bg)', color: 'var(--listed-ink)' }
                }
              >
                {b.branch_name}: {b.bookable ? 'Bookable' : 'Listed'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
            Not yet listed at Scene
          </p>
        )}

        {showWatchlistControl && (
          <form
            action={
              isWatchlisted
                ? removeFromWatchlist.bind(null, movie.id)
                : addToWatchlist.bind(null, movie.id)
            }
            className="mt-auto pt-1"
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
