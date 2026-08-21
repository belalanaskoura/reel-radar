'use client';

import { useOptimistic, useTransition } from 'react';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

export function MovieCardWatchlistButton({
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
      className="w-full rounded-sm border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
      style={
        optimisticWatchlisted
          ? { borderColor: 'var(--rule)', color: 'var(--ink-dim)', background: 'transparent' }
          : { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
      }
    >
      {optimisticWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
    </button>
  );
}
