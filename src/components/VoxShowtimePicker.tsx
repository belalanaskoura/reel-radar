'use client';

import { useState } from 'react';
import { DateTabStrip } from '@/components/DateTabStrip';
import { formatIsoDateLabel } from '@/lib/scene/dates';
import type { VoxDayDetail } from '@/lib/branches';

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
  const [selectedDate, setSelectedDate] = useState<string | null>(days[0]?.date ?? null);

  const dateTabs = days.map((d) => ({ date: d.date, label: formatIsoDateLabel(d.date) }));
  const selectedDay = days.find((d) => d.date === selectedDate);

  function selectDate(date: string) {
    setSelectedDate(selectedDate === date ? null : date);
  }

  return (
    <div className="flex flex-col gap-3">
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
                        title="Opens VOX's showtimes page -- a specific showtime link isn't available"
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
        </div>
      )}
    </div>
  );
}
