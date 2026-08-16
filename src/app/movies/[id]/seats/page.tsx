'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon } from '@/components/icons';
import { SeatGrid, SeatGridSkeleton } from '@/components/SeatGrid';
import type { Seat } from '@/lib/scene/seat-plan';

// Honest, in-order narration of what /api/seat-plan is actually doing
// server-side (see seat-plan.ts: launch a real headless browser, open the
// live showtime page, wait for Scene's own seat-plan response) -- a real
// cold Chromium launch on Vercel plus a live third-party page load
// routinely takes 10-20s+, long enough that a single static line reads as
// stalled well before it resolves. Timings are staggered rather than even
// (the browser launch is the slow, unpredictable part) so the message
// keeps changing through the whole wait instead of finishing early and
// sitting idle on the last line.
const LOADING_MESSAGES = [
  { afterMs: 0, text: 'Connecting to Scene Cinemas…' },
  { afterMs: 2500, text: 'Opening the real showtime page…' },
  { afterMs: 6000, text: 'Reading live seat availability…' },
  { afterMs: 12000, text: 'Scene Cinemas is taking a moment — hang tight…' },
];

function useLoadingMessage(): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timers = LOADING_MESSAGES.slice(1).map((msg, i) =>
      setTimeout(() => setIndex(i + 1), msg.afterMs),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return LOADING_MESSAGES[index].text;
}

// Isolated so its useState(0) is fresh every time the loading state mounts
// (via key={showtimeUrl} at the call site) -- the sequence needs to
// restart from the first message on every new load, and a full remount is
// what actually achieves that without an effect calling setState to "undo"
// a previous run's progress.
function LoadingStatus() {
  const message = useLoadingMessage();
  return (
    <p
      key={message}
      className="animate-fade-in text-center text-sm"
      style={{ color: 'var(--ink-dim)' }}
      role="status"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

// A real, standalone page rather than an inline disclosure on the movie
// detail page -- the seat map needs real width and vertical room to read
// as an actual theater layout, which a card nested inside the Showtimes
// tab couldn't give it. Showtime context (time/format/branch/movie title)
// travels via query params from ShowtimePicker's link rather than a
// second lookup, since ShowtimePicker already has all of it in hand.
export default function SeatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: movieId } = use(params);
  const searchParams = useSearchParams();

  const showtimeUrl = searchParams.get('showtimeUrl') ?? '';
  const time = searchParams.get('time') ?? '';
  const format = searchParams.get('format') ?? '';
  const branchName = searchParams.get('branchName') ?? '';
  const movieTitle = searchParams.get('movieTitle') ?? '';

  // Keyed by showtimeUrl rather than reset imperatively: a fetch's result
  // is only applied if showtimeUrl hasn't changed since it started, so
  // switching showtimes can't have a slow, stale response for the old one
  // clobber the new one's state.
  const [result, setResult] = useState<{
    showtimeUrl: string;
    seats: Seat[] | null;
    bookingUrl: string | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!showtimeUrl) return;
    let cancelled = false;
    fetch('/api/seat-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showtimeUrl }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('seat-plan request failed');
        return res.json() as Promise<{ seats: Seat[]; bookingUrl: string }>;
      })
      .then((data) => {
        if (cancelled) return;
        setResult({ showtimeUrl, seats: data.seats, bookingUrl: data.bookingUrl, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ showtimeUrl, seats: null, bookingUrl: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [showtimeUrl]);

  const loading = !!showtimeUrl && result?.showtimeUrl !== showtimeUrl;
  const error = result?.showtimeUrl === showtimeUrl && result.error;
  const seats = result?.showtimeUrl === showtimeUrl ? result.seats : null;
  const bookingUrl = result?.showtimeUrl === showtimeUrl ? result.bookingUrl : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/movies/${movieId}`}
        className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--ink-dim)' }}
      >
        <ArrowLeftIcon size={15} />
        Back to showtimes
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl leading-tight sm:text-3xl" style={{ color: 'var(--ink)' }}>
          {movieTitle || 'Select your seats'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          {[branchName, format, time].filter(Boolean).join(' · ')}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <LoadingStatus key={showtimeUrl} />
          <SeatGridSkeleton />
        </div>
      ) : error || !seats ? (
        <p className="rounded-sm border px-4 py-6 text-center text-sm" style={{ borderColor: 'var(--rule)', color: 'var(--error-ink)' }}>
          Couldn&apos;t load the seat map for this showtime. It may have already started or sold out.
        </p>
      ) : (
        <SeatGrid seats={seats} bookingUrl={bookingUrl ?? showtimeUrl} />
      )}
    </main>
  );
}
