'use client';

import { useState } from 'react';
import { DateTabStrip } from '@/components/DateTabStrip';
import { formatIsoDateLabel } from '@/lib/scene/dates';
import type { VoxDayDetail } from '@/lib/branches';
import { InfoIcon } from '@/components/icons';

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
}: {
  days: VoxDayDetail[];
  branchShowtimesUrl: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
            {selectedDay.formats.map((f) => (
              <div key={f.format}>
                <p
                  className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase"
                  style={{ color: 'var(--ink-dim)' }}
                >
                  {f.format}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {f.showtimes.map((s) => (
                    <li key={s.time}>
                      <a
                        href={branchShowtimesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-sm px-2 py-1 text-xs font-medium transition-opacity hover:opacity-90"
                        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                      >
                        {s.time}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
    </div>
  );
}
