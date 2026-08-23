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
    // Compact top-right toggle for a poster card. Icon-only was tried
    // first and found unclear to users -- a small, low-contrast
    // translucent bookmark blended into a busy poster and gave no hint
    // of what clicking it does. Fixed two ways: a short label makes the
    // action explicit at a glance instead of relying on the icon alone
    // (kept visible always, not hover-only, so it works on touch
    // devices too -- this app gets real mobile traffic), and the
    // untracked state is now solid/high-contrast (accent-tinted) rather
    // than the old translucent-dark treatment, so the actionable state
    // is the one that visually pops instead of the completed one. Kept
    // sized small on purpose (originally even tighter, nudged up
    // slightly after that felt too small) so it doesn't eat much of the
    // poster on a 2-column mobile card.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimisticWatchlisted}
        aria-label={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        title={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        className="flex items-center gap-1 rounded-full py-1 pr-2 pl-1.5 text-[11px] font-semibold backdrop-blur-sm transition-opacity hover:opacity-85"
        style={
          optimisticWatchlisted
            ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
            : { background: 'color-mix(in srgb, var(--accent) 22%, var(--bg) 78%)', color: 'var(--accent)' }
        }
      >
        <BookmarkIcon size={12} style={{ fill: optimisticWatchlisted ? 'currentColor' : 'none' }} />
        {optimisticWatchlisted ? 'Radar' : 'Track'}
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
