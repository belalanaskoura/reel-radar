'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { getDayShowtimes } from '@/app/movies/[id]/actions';
import { DateTabStrip } from '@/components/DateTabStrip';
import { Skeleton } from '@/components/Skeleton';
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
        <div className="panel-reveal rounded-sm border p-3" style={{ borderColor: 'var(--rule)' }}>
          {loadingDate === selectedDate ? (
            <DayShowtimesSkeleton />
          ) : errorDate === selectedDate ? (
            <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
              Couldn&apos;t load showtimes. Try again.
            </p>
          ) : showtimes && showtimes.length > 0 ? (
            <div className="flex flex-col gap-4">
              {groupByFormat(showtimes).map(([format, group]) => {
                // Price is a property of the format/hall, not the
                // individual showtime -- shown once next to the format
                // label rather than repeated on every time pill (see
                // VoxShowtimePicker, which had the same crowding problem
                // when price was stacked inside each button).
                const templateRow = findTemplateRowForFormat(priceTemplate, branchId as BranchId, format);
                return (
                  <div key={format} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold tracking-wide uppercase"
                        style={{ color: 'var(--ink)' }}
                      >
                        {format}
                      </span>
                      {templateRow && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-normal normal-case"
                          style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}
                        >
                          {templateRow.priceEgp} EGP
                        </span>
                      )}
                    </div>
                    <ul className="flex flex-wrap gap-2">
                      {group.map((s) => (
                        <li key={s.bookingUrl}>
                          {s.soldOut ? (
                            <span
                              className="inline-block rounded-full border px-3 py-1.5 text-xs font-medium line-through"
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
                              className="showtime-pill inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold"
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

// Echoes the real final shape (a format label + price pill, then a row
// of time pills) rather than a bare "Loading showtimes..." line -- this
// component's own fetch is a live network round-trip that can take a
// beat, and a plain text line reads as less finished than the seats
// page's own SeatGridSkeleton right next door for the same kind of wait.
function DayShowtimesSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
      </div>
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
