'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { followCinema, unfollowCinema } from '@/app/cinemas/actions';

// How long the one-shot confirm ring plays before being unmounted --
// must match .signal-confirm's animation-duration in globals.css.
const CONFIRM_DURATION_MS = 450;

export function CinemaFollowButton({
  branchId,
  isFollowing,
  variant = 'pill',
}: {
  branchId: string;
  isFollowing: boolean;
  variant?: 'pill' | 'icon';
}) {
  const [optimisticFollowing, setOptimisticFollowing] = useOptimistic(isFollowing);
  const [, startTransition] = useTransition();
  // Plays the confirm ring once, only on the moment tracking starts --
  // never on mount and never on untrack, so it reads as feedback for a
  // real action rather than an ambient loop.
  const [showConfirm, setShowConfirm] = useState(false);

  function toggle() {
    const next = !optimisticFollowing;
    if (next) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), CONFIRM_DURATION_MS);
    }
    startTransition(async () => {
      setOptimisticFollowing(next);
      await (next ? followCinema(branchId) : unfollowCinema(branchId));
    });
  }

  if (variant === 'icon') {
    // Compact radar "signal" toggle for the /cinemas card header, in
    // place of the old purely-decorative arrow icon there. Originally
    // shipped as a bare dot with no label -- same clarity problem the
    // movie-card radar toggle had (an unlabeled control gave no hint
    // what clicking it does), so this now carries the same short label
    // treatment: solid/high-contrast pill instead of a translucent
    // circle, with the label always visible (not hover-only, since this
    // app gets real mobile traffic).
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimisticFollowing}
        aria-label={optimisticFollowing ? 'Untrack this cinema' : 'Track this cinema'}
        title={optimisticFollowing ? 'Untrack this cinema' : 'Track this cinema'}
        className="flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-2.5 pl-2 text-[11px] font-semibold transition-[opacity,transform] duration-150 ease-out hover:opacity-85 active:scale-[0.95]"
        style={
          optimisticFollowing
            ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
            // Same fix as MovieCardWatchlistButton's icon variant: the
            // 22%-accent color-mix failed WCAG AA in light mode (3.50:1,
            // measured directly, under the 4.5:1 small-text minimum) --
            // opaque --surface clears it in both themes (9.65:1 dark,
            // 5.23:1 light) while keeping the same accent text/border.
            : { background: 'var(--surface)', color: 'var(--accent)', borderColor: 'var(--accent)' }
        }
      >
        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
          {showConfirm && (
            <span
              className="signal-confirm absolute inset-0 rounded-full"
              style={{ background: 'currentColor' }}
            />
          )}
          <span
            className="relative h-1.5 w-1.5 rounded-full"
            style={
              optimisticFollowing
                ? { background: 'currentColor' }
                : { boxShadow: 'inset 0 0 0 1.5px currentColor' }
            }
          />
        </span>
        {optimisticFollowing ? 'Tracking' : 'Track'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-sm border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
      style={
        optimisticFollowing
          ? { borderColor: 'var(--rule)', color: 'var(--ink-dim)', background: 'transparent' }
          : { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
      }
    >
      {optimisticFollowing ? 'Tracking' : 'Track cinema'}
    </button>
  );
}
