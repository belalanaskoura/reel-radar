'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { getDayShowtimes } from '@/app/movies/[id]/actions';
import { DateTabStrip } from '@/components/DateTabStrip';
import { formatSceneDateLabel } from '@/lib/scene/dates';
import { findTemplateRowForFormat, type ScenePriceTemplateRow } from '@/lib/scene/price-template';
import type { BranchId, SceneShowtime } from '@/lib/scene/types';

export function ShowtimePicker({
  movieId,
  movieTitle,
  branchId,
  branchName,
  slug,
  dates,
  priceTemplate,
}: {
  movieId: string;
  movieTitle: string;
  branchId: string;
  branchName: string;
  slug: string;
  dates: string[];
  priceTemplate: ScenePriceTemplateRow[];
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showtimesByDate, setShowtimesByDate] = useState<Record<string, SceneShowtime[]>>({});
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [errorDate, setErrorDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function selectDate(date: string) {
    if (selectedDate === date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(date);
    setErrorDate(null);

    if (showtimesByDate[date]) return;

    setLoadingDate(date);
    startTransition(async () => {
      try {
        const result = await getDayShowtimes(branchId, slug, date);
        setShowtimesByDate((prev) => ({ ...prev, [date]: result.showtimes }));
      } catch {
        setErrorDate(date);
      } finally {
        setLoadingDate(null);
      }
    });
  }

  const dateTabs = dates.map((date) => ({ date, label: formatSceneDateLabel(date) }));
  const showtimes = selectedDate ? showtimesByDate[selectedDate] : undefined;

  return (
    <div className="flex flex-col gap-3">
      <DateTabStrip dates={dateTabs} selectedDate={selectedDate} onSelect={selectDate} />

      {selectedDate && (
        <div className="rounded-sm border p-3" style={{ borderColor: 'var(--rule)' }}>
          {loadingDate === selectedDate ? (
            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              Loading showtimes...
            </p>
          ) : errorDate === selectedDate ? (
            <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
              Couldn&apos;t load showtimes. Try again.
            </p>
          ) : showtimes && showtimes.length > 0 ? (
            <div className="flex flex-col gap-3">
              {groupByFormat(showtimes).map(([format, group]) => {
                // Price is a property of the format/hall, not the
                // individual showtime -- shown once next to the format
                // label rather than repeated on every time pill (see
                // VoxShowtimePicker, which had the same crowding problem
                // when price was stacked inside each button).
                const templateRow = findTemplateRowForFormat(priceTemplate, branchId as BranchId, format);
                return (
                  <div key={format}>
                    <p
                      className="mb-1.5 flex items-baseline gap-1.5 text-[11px] font-semibold tracking-wide uppercase"
                      style={{ color: 'var(--ink-dim)' }}
                    >
                      <span>{format}</span>
                      {templateRow && (
                        <span
                          className="text-[10px] font-medium tracking-normal normal-case"
                          style={{ color: 'var(--accent-dim)' }}
                        >
                          {templateRow.priceEgp} EGP
                        </span>
                      )}
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {group.map((s) => (
                        <li key={s.bookingUrl}>
                          {s.soldOut ? (
                            <span
                              className="inline-block rounded-sm border px-2 py-1 text-xs line-through"
                              style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
                            >
                              {s.time}
                            </span>
                          ) : (
                            <Link
                              href={{
                                pathname: `/movies/${movieId}/seats`,
                                query: {
                                  showtimeUrl: s.bookingUrl,
                                  time: s.time,
                                  format,
                                  branchName,
                                  branchId,
                                  movieTitle,
                                },
                              }}
                              className="inline-block rounded-sm px-2 py-1 text-xs font-medium transition-opacity hover:opacity-90"
                              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                            >
                              {s.time}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              No showtimes found for this day.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Groups a day's showtimes by their format (Standard, Premiere, IMAX,
// ...) so a movie showing in multiple formats at once (e.g. a normal
// screen and an IMAX screen on the same day) displays each as its own
// clearly labeled section instead of one flat, undifferentiated list of
// times. Preserves first-seen format order rather than sorting
// alphabetically, matching the order Scene's own page lists them in.
function groupByFormat(showtimes: SceneShowtime[]): [string, SceneShowtime[]][] {
  const groups = new Map<string, SceneShowtime[]>();
  for (const s of showtimes) {
    const key = s.format || 'Standard';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()];
}
