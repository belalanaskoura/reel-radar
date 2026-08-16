'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon } from '@/components/icons';
import { SeatGrid } from '@/components/SeatGrid';
import type { Seat } from '@/lib/scene/seat-plan';

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
        <div className="flex flex-col items-center gap-3 py-16">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            Loading the real seat map from Scene Cinemas...
          </p>
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
