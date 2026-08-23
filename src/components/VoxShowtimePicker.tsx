'use client';

import { useState } from 'react';
import { DateTabStrip } from '@/components/DateTabStrip';
import { formatIsoDateLabel } from '@/lib/scene/dates';
import type { VoxDayDetail } from '@/lib/branches';
import { InfoIcon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useWatchlistBookingConfirm, type WatchlistBookingClickAction } from '@/components/useWatchlistBookingConfirm';

// Unlike ShowtimePicker (Scene), every day's real showtime detail is
// already in hand from scrape-vox's own scheduled run -- no per-day
// fetch on click, since elCinema has no cheap partial-detail endpoint to
// defer to (see scrape-vox's own comments). Each time slot links to the
// branch's general showtimes page, not a specific showtime, since a real
// per-showtime VOX booking link is robots.txt-disallowed (see
// src/lib/branches.ts's voxBranchShowtimesUrl).
export function VoxShowtimePicker({
  days,
  branchShowtimesUrl,
  movieId,
  movieTitle,
  isWatchlisted = false,
  initialBookingClickAction = 'ask',
}: {
  days: VoxDayDetail[];
  branchShowtimesUrl: string;
  // Only present (and only asks to remove) when this movie is actually
  // on the viewer's watchlist -- movieId is required by the confirm
  // hook, but the hook itself is only invoked/used when isWatchlisted is
  // true, so a non-watchlisted movie's time slots behave exactly as
  // before (plain link, no dialog).
  movieId?: string;
  movieTitle?: string;
  isWatchlisted?: boolean;
  initialBookingClickAction?: WatchlistBookingClickAction;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { confirmDialog, openBookingLink, confirmRemoval, keepWatching } = useWatchlistBookingConfirm(
    movieId ?? '',
    initialBookingClickAction,
  );

  const dateTabs = days.map((d) => ({ date: d.date, label: formatIsoDateLabel(d.date) }));
  const selectedDay = days.find((d) => d.date === selectedDate);

  function selectDate(date: string) {
    setSelectedDate(selectedDate === date ? null : date);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Shown before any day is even picked, not tucked below the times
          like the date-mismatch note further down: this needs to set
          expectations before a user gets excited about a specific
          showtime, not after -- elCinema (VOX's data source) has no
          sold-out/seat-availability signal anywhere in its markup
          (confirmed against its live pages), so this app genuinely
          cannot know which of these times are actually still bookable. */}
      <div
        className="flex items-start gap-2 rounded-sm border p-2.5"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <InfoIcon size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-dim)' }} />
        <p className="text-xs leading-snug" style={{ color: 'var(--ink-dim)' }}>
          Some showtimes below may already be fully booked — VOX doesn&rsquo;t give us live
          seat availability, so double-check on their site before heading out.
        </p>
      </div>

      <DateTabStrip dates={dateTabs} selectedDate={selectedDate} onSelect={selectDate} />

      {selectedDay && (
        <div className="rounded-sm border p-3" style={{ borderColor: 'var(--rule)' }}>
          <div className="flex flex-col gap-3">
            {selectedDay.formats.map((f) => {
              // Price is constant across every showtime within a format on
              // a given day (confirmed against real elCinema data -- VOX
              // prices by format/hall, not by individual time slot), so
              // it's shown once next to the format label rather than
              // repeated on every time pill, which cramped each button
              // into an unreadable two-line chip.
              const price = f.showtimes.find((s) => s.price)?.price;
              return (
                <div key={f.format} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--ink)' }}>
                      {f.format}
                    </span>
                    {price && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-normal normal-case"
                        style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}
                      >
                        {price}
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {f.showtimes.map((s) => (
                      <li key={s.time}>
                        <a
                          href={branchShowtimesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={
                            isWatchlisted && movieId
                              ? (e) => openBookingLink(e, branchShowtimesUrl, true)
                              : undefined
                          }
                          className="showtime-pill inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold"
                        >
                          {s.time}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div
            className="mt-3 flex items-start gap-2 border-t pt-3"
            style={{ borderColor: 'var(--rule)' }}
          >
            <InfoIcon size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-dim)' }} />
            <p className="text-xs leading-snug" style={{ color: 'var(--ink-dim)' }}>
              VOX&rsquo;s booking page always opens to today&rsquo;s date. If you picked a
              different day above, re-select it on their site before booking.
            </p>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          title="Remove from watchlist?"
          description={
            movieTitle
              ? `You're about to view showtimes for "${movieTitle}". If you're booking tickets, we can take it off your watchlist for you.`
              : "If you're booking tickets, we can take this off your watchlist for you."
          }
          confirmLabel="Remove"
          cancelLabel="Keep watching"
          dontAskAgainLabel="Don't ask me again (change anytime in Settings)"
          onConfirm={confirmRemoval}
          onCancel={keepWatching}
        />
      )}
    </div>
  );
}
