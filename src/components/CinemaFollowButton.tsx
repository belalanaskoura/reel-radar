'use client';

import { useOptimistic, useTransition } from 'react';
import { followCinema, unfollowCinema } from '@/app/cinemas/actions';

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

  function toggle() {
    const next = !optimisticFollowing;
    startTransition(async () => {
      setOptimisticFollowing(next);
      await (next ? followCinema(branchId) : unfollowCinema(branchId));
    });
  }

  if (variant === 'icon') {
    // Compact radar "signal" toggle for a tight slot (the /cinemas card
    // header, in place of the old purely-decorative arrow icon there) --
    // same filled/pulsing-dot visual language CinemaAlertsCard already
    // uses for "this branch is being watched", just at button scale.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimisticFollowing}
        aria-label={optimisticFollowing ? 'Untrack this cinema' : 'Track this cinema'}
        title={optimisticFollowing ? 'Untrack this cinema' : 'Track this cinema'}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {optimisticFollowing && (
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: 'var(--accent)', opacity: 0.35 }}
          >
            <span className="signal-ping absolute inset-0 rounded-full" style={{ background: 'var(--accent)', opacity: 0.6 }} />
          </span>
        )}
        <span
          className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full transition-all duration-200"
          style={{
            background: optimisticFollowing ? 'var(--accent)' : 'transparent',
            boxShadow: optimisticFollowing ? 'none' : 'inset 0 0 0 1.5px var(--ink-dim)',
          }}
        />
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
