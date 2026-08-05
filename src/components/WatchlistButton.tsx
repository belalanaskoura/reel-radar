import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

export function WatchlistButton({
  movieId,
  isWatchlisted,
}: {
  movieId: string;
  isWatchlisted: boolean;
}) {
  return (
    <form action={(isWatchlisted ? removeFromWatchlist : addToWatchlist).bind(null, movieId)}>
      <button
        type="submit"
        className="rounded-sm border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        style={
          isWatchlisted
            ? { borderColor: 'var(--rule)', color: 'var(--ink-dim)', background: 'transparent' }
            : { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
        }
      >
        {isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
      </button>
    </form>
  );
}
