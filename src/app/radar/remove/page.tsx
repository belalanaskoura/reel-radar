import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyRadarToken } from '@/lib/radar-link';
import { radarLinkRowCutoff } from '@/lib/radar-remove';
import { SubmitButton } from '@/components/SubmitButton';
import { confirmRemoveFromRadar } from './actions';

// The token is in this page's URL, so keep it out of search indexes and
// out of the Referer header sent when someone follows a link from here.
export const metadata: Metadata = {
  title: 'Remove from radar',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Too many attempts. Try again in a little while.',
  failed: 'Something went wrong. Try again, or remove it from your radar page.',
};

export default async function RemoveFromRadarPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[]; done?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === 'string' ? params.t : undefined;
  const done = params.done === '1';
  const error = typeof params.error === 'string' ? params.error : undefined;
  const claims = verifyRadarToken(token, process.env.RADAR_LINK_SECRET);

  let movieTitle: string | null = null;
  let onRadar = false;
  let readdedSinceLink = false;
  if (claims) {
    const supabase = createServiceRoleClient();
    const [{ data: movie }, { data: row }] = await Promise.all([
      supabase.from('movies').select('title').eq('id', claims.movieId).maybeSingle(),
      supabase
        .from('watchlist')
        .select('created_at')
        .eq('user_id', claims.userId)
        .eq('movie_id', claims.movieId)
        .maybeSingle(),
    ]);
    movieTitle = movie?.title ?? null;
    // Mirrors the delete in removeFromRadarWithToken: a row added after
    // this link was minted isn't one the link can remove.
    readdedSinceLink = !!row && Date.parse(row.created_at) > Date.parse(radarLinkRowCutoff(claims));
    onRadar = !!row && !readdedSinceLink;
  }

  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
        }}
      />
      <div className="relative mx-auto max-w-sm px-6 py-16">
        {!claims || !movieTitle || readdedSinceLink ? (
          <>
            <h1 className="font-display mb-2 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
              Link expired
            </h1>
            <p className="mb-8 text-sm" style={{ color: 'var(--ink-dim)' }}>
              This link has expired or isn&apos;t valid. You can still remove movies from your radar page.
            </p>
            <Link
              href="/watchlist"
              className="inline-block rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Go to my radar
            </Link>
          </>
        ) : onRadar ? (
          <>
            <h1 className="font-display mb-2 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
              Remove from radar?
            </h1>
            <p className="mb-8 text-sm" style={{ color: 'var(--ink-dim)' }}>
              You&apos;ll stop getting alerts and daily reminders for{' '}
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {movieTitle}
              </span>
              .
            </p>

            {errorMessage && (
              <p
                role="alert"
                className="mb-4 rounded-sm px-3 py-2 text-sm"
                style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}
              >
                {errorMessage}
              </p>
            )}

            <form action={confirmRemoveFromRadar} className="flex flex-col gap-3">
              <input type="hidden" name="token" value={token} />
              <SubmitButton
                pendingLabel="Removing..."
                className="rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 disabled:opacity-60"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Remove from radar
              </SubmitButton>
              <Link
                href={`/movies/${claims.movieId}`}
                className="rounded-sm border px-3 py-2 text-center text-sm font-medium transition-opacity hover:opacity-80 focus-visible:ring-2"
                style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
              >
                Keep it
              </Link>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display mb-2 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
              {done ? 'Removed' : 'Already off your radar'}
            </h1>
            <p className="mb-8 text-sm" style={{ color: 'var(--ink-dim)' }}>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {movieTitle}
              </span>{' '}
              is off your radar. You won&apos;t get more alerts or reminders for it.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={`/movies/${claims.movieId}`}
                className="rounded-sm px-3 py-2 text-center text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                View movie
              </Link>
              <Link
                href="/browse"
                className="rounded-sm border px-3 py-2 text-center text-sm font-medium transition-opacity hover:opacity-80 focus-visible:ring-2"
                style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
              >
                Browse movies
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
