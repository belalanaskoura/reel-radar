'use client';

import { useOptimistic, useTransition } from 'react';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';
import { BookmarkIcon } from '@/components/icons';

export function MovieCardWatchlistButton({
  movieId,
  isWatchlisted,
  variant = 'pill',
}: {
  movieId: string;
  isWatchlisted: boolean;
  variant?: 'pill' | 'icon';
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

  if (variant === 'icon') {
    // Compact top-right toggle for a poster card, a filled/outline
    // bookmark rather than a full-width text pill -- fits a tight
    // corner slot the way MovieCard's old bookable/listed badge did,
    // while a signed-in user's own radar state now lives there instead.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimisticWatchlisted}
        aria-label={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        title={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-opacity hover:opacity-80"
        style={{
          background: optimisticWatchlisted ? 'var(--accent)' : 'color-mix(in srgb, var(--bg) 65%, transparent)',
          color: optimisticWatchlisted ? 'var(--accent-ink)' : 'var(--ink)',
        }}
      >
        <BookmarkIcon size={15} style={{ fill: optimisticWatchlisted ? 'currentColor' : 'none' }} />
      </button>
    );
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
      {optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
    </button>
  );
}
