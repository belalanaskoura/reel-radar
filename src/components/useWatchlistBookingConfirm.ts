'use client';

import { useState, useTransition } from 'react';
import { removeFromWatchlist } from '@/app/watchlist/actions';
import { updateWatchlistConfirmPreference } from '@/app/account/actions';

export type WatchlistBookingClickAction = 'ask' | 'always_remove' | 'always_keep';

// Shared "clicking a booking link probably means tickets are being
// booked, offer to take it off the watchlist" logic -- used by both
// WatchlistGrid's card button and VoxShowtimePicker's individual
// per-showtime links (movies/[id], only when the movie is actually on
// the user's watchlist there). Extracted here rather than duplicated in
// both components once a second real caller showed up.
export function useWatchlistBookingConfirm(
  movieId: string,
  initialAction: WatchlistBookingClickAction = 'ask',
) {
  const [bookingClickAction, setBookingClickAction] = useState<WatchlistBookingClickAction>(initialAction);
  const [confirmDialog, setConfirmDialog] = useState<{ href: string; newTab: boolean } | null>(null);
  const [, startTransition] = useTransition();

  function navigateTo(href: string, newTab: boolean) {
    if (newTab) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.assign(href);
    }
  }

  function removeAndNavigate(href: string, newTab: boolean) {
    startTransition(async () => {
      await removeFromWatchlist(movieId);
    });
    navigateTo(href, newTab);
  }

  function saveBookingClickAction(next: WatchlistBookingClickAction) {
    setBookingClickAction(next);
    startTransition(async () => {
      await updateWatchlistConfirmPreference(next);
    });
  }

  function openBookingLink(e: React.MouseEvent, href: string, newTab: boolean) {
    e.preventDefault();
    if (bookingClickAction === 'always_remove') {
      removeAndNavigate(href, newTab);
      return;
    }
    if (bookingClickAction === 'always_keep') {
      navigateTo(href, newTab);
      return;
    }
    setConfirmDialog({ href, newTab });
  }

  function confirmRemoval(dontAskAgain: boolean) {
    if (!confirmDialog) return;
    const { href, newTab } = confirmDialog;
    setConfirmDialog(null);
    if (dontAskAgain) saveBookingClickAction('always_remove');
    removeAndNavigate(href, newTab);
  }

  function keepWatching(dontAskAgain: boolean) {
    if (!confirmDialog) return;
    const { href, newTab } = confirmDialog;
    setConfirmDialog(null);
    if (dontAskAgain) saveBookingClickAction('always_keep');
    navigateTo(href, newTab);
  }

  return { confirmDialog, openBookingLink, confirmRemoval, keepWatching };
}
