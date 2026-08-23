'use client';

import { useOptimistic, useTransition } from 'react';
import { followCinema, unfollowCinema } from '@/app/cinemas/actions';

export function CinemaFollowButton({
  branchId,
  isFollowing,
}: {
  branchId: string;
  isFollowing: boolean;
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
      {optimisticFollowing ? 'Following' : 'Follow cinema'}
    </button>
  );
}
