'use client';

import { useOptimistic, useTransition } from 'react';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

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
    //
    // The glyph itself is CinemaAlertsCard/CinemaFollowButton's own
    // "signal dot" (filled + pulsing when tracked, hollow ring when
    // not) rather than a bookmark icon, so every radar-tracking control
    // in the app reads as the same visual language.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimisticWatchlisted}
        aria-label={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        title={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        className="flex items-center gap-1.5 rounded-full py-1 pr-2 pl-1.5 text-[11px] font-semibold backdrop-blur-sm transition-opacity hover:opacity-85"
        style={
          optimisticWatchlisted
            ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
            : { background: 'color-mix(in srgb, var(--accent) 22%, var(--bg) 78%)', color: 'var(--accent)' }
        }
      >
        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
          {optimisticWatchlisted && (
            <span
              className="signal-ping absolute inset-0 rounded-full"
              style={{ background: 'currentColor', opacity: 0.5 }}
            />
          )}
          <span
            className="relative h-1.5 w-1.5 rounded-full"
            style={
              optimisticWatchlisted
                ? { background: 'currentColor' }
                : { boxShadow: 'inset 0 0 0 1.5px currentColor' }
            }
          />
        </span>
        {optimisticWatchlisted ? 'Tracked' : 'Track'}
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
