'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { addToWatchlist, removeFromWatchlist } from '@/app/watchlist/actions';

// How long the one-shot confirm ring plays before being unmounted --
// must match .signal-confirm's animation-duration in globals.css.
const CONFIRM_DURATION_MS = 450;

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
  // Plays the confirm ring once, only on the moment tracking starts --
  // never on mount and never on untrack, so it reads as feedback for a
  // real action rather than an ambient loop running on every card in
  // the grid.
  const [showConfirm, setShowConfirm] = useState(false);

  function toggle() {
    const next = !optimisticWatchlisted;
    if (next) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), CONFIRM_DURATION_MS);
    }
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
    // "signal dot" (filled when tracked, hollow ring when not) rather
    // than a bookmark icon, so every radar-tracking control in the app
    // reads as the same visual language. The dot used to pulse forever
    // once tracked -- replaced with a one-shot confirm ring that plays
    // only at the moment of tracking, since an animation that never
    // stops across every card in a grid reads as ambient noise, not
    // feedback for the action the user just took.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimisticWatchlisted}
        aria-label={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        title={optimisticWatchlisted ? 'Remove from radar' : 'Add to radar'}
        className="flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-1.5 text-[11px] font-semibold transition-[opacity,transform] duration-150 ease-out hover:opacity-85 active:scale-[0.95]"
        style={
          optimisticWatchlisted
            ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
            // Opaque --surface, not a color-mix accent tint: the mix was
            // only 22% accent (mostly --bg), which failed WCAG AA in
            // light mode (3.50:1 vs the 4.5:1 small-text minimum,
            // measured directly) since this chip sits over unpredictable
            // poster art with no real image behind it to blur -- the
            // backdrop-blur-sm it had was dead CSS anyway, color-mix()
            // produces an opaque color so nothing was ever showing
            // through to blur. --surface clears AA in both themes
            // (9.65:1 dark, 5.23:1 light) while keeping the same accent
            // text/border so the chip still reads as "trackable."
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
