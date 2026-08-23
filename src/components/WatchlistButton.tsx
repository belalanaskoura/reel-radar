'use client';

import { useOptimistic, useTransition } from 'react';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

export function WatchlistButton({
  movieId,
  isWatchlisted,
}: {
  movieId: string;
  isWatchlisted: boolean;
}) {
  const [optimisticWatchlisted, setOptimisticWatchlisted] = useOptimistic(isWatchlisted);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !optimisticWatchlisted;
    startTransition(async () => {
      setOptimisticWatchlisted(next);
      await (next ? addToWatchlist(movieId) : removeFromWatchlist(movieId));
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-sm border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
      style={
        optimisticWatchlisted
          ? { borderColor: 'var(--rule)', color: 'var(--ink-dim)', background: 'transparent' }
          : { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
      }
    >
      {optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
    </button>
  );
}
