'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Root error boundary: Next.js App Router requires error.tsx (a Client
// Component -- the reset() callback it receives only works client-side)
// to catch a thrown error from a Server Component render. Before this
// existed, ANY unhandled throw anywhere in the tree -- a rejected
// Supabase query, a rejected TMDB fetch -- fell through to Next's generic
// crash page with no on-brand messaging and no way to retry short of a
// full reload. This is deliberately the one and only error boundary
// (no per-route error.tsx files) since a single well-designed fallback
// covers every route without needing one per segment; add a nested one
// later only if a specific route needs different recovery behavior than
// "try again or go home."
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled render error:', error);
  }, [error]);

  return (
    <main className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
        }}
      />
      <div className="relative max-w-sm text-center">
        <h1 className="font-display mb-3 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
          Something went wrong
        </h1>
        <p className="mb-8 text-sm" style={{ color: 'var(--ink-dim)' }}>
          That&apos;s on us, not you. Try again, or head back to the browse page.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-sm px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            Try again
          </button>
          <Link
            href="/browse"
            className="rounded-sm border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
          >
            Go to browse
          </Link>
        </div>
      </div>
    </main>
  );
}
