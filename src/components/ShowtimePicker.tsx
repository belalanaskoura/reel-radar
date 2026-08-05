'use client';

import { useState, useTransition } from 'react';
import { getDayShowtimes } from '@/app/movies/[id]/actions';
import type { SceneShowtime } from '@/lib/scene/types';

export function ShowtimePicker({
  branchId,
  slug,
  dates,
}: {
  branchId: string;
  slug: string;
  dates: string[];
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [showtimesByDate, setShowtimesByDate] = useState<Record<string, SceneShowtime[]>>({});
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [errorDate, setErrorDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleDate(date: string) {
    if (openDate === date) {
      setOpenDate(null);
      return;
    }
    setOpenDate(date);
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

  return (
    <ul className="flex flex-col gap-2">
      {dates.map((date) => {
        const isOpen = openDate === date;
        const showtimes = showtimesByDate[date];
        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => toggleDate(date)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-80"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
            >
              <span className="tabular-nums">{formatDate(date)}</span>
              <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
              <div className="mt-1 rounded-sm border p-3" style={{ borderColor: 'var(--rule)' }}>
                {loadingDate === date ? (
                  <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                    Loading showtimes...
                  </p>
                ) : errorDate === date ? (
                  <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
                    Couldn&apos;t load showtimes. Try again.
                  </p>
                ) : showtimes && showtimes.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {groupByFormat(showtimes).map(([format, group]) => (
                      <div key={format}>
                        <p
                          className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase"
                          style={{ color: 'var(--ink-dim)' }}
                        >
                          {format}
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
                                <a
                                  href={s.bookingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block rounded-sm px-2 py-1 text-xs font-medium transition-opacity hover:opacity-90"
                                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                                >
                                  {s.time}
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                    No showtimes found for this day.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
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

function formatDate(date: string): string {
  const [day, month, year] = date.split('-');
  if (!day || !month || !year) return date;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
