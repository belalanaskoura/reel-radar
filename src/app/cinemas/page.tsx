import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MapPinIcon, ArrowRightIcon } from '@/components/icons';

export default async function CinemasPage() {
  const supabase = await createClient();

  // Branches and bookable counts fetched concurrently rather than
  // sequentially, and the counts come from one query grouped client-side
  // instead of one round-trip per branch -- showtimes_cache is still the
  // source of truth (same table /browse and the poll job read), just
  // queried once instead of N+1 times.
  //
  // Joined through to movies.match_status and filtered the same way the
  // per-branch page (/cinemas/[id]) and /browse already do: an 'ambiguous'
  // row (unresolved TMDB match, Phase 5's manual-review queue) is never
  // shown anywhere in the app, but without this filter a bookable-but-
  // ambiguous showtime was still counted here -- inflating this page's
  // number above what the branch detail page (which does filter) shows
  // for the same branch.
  const [{ data: branches }, { data: bookableRows }] = await Promise.all([
    supabase.from('branches').select('id, name, base_url, address, formats').order('id', { ascending: true }),
    supabase.from('showtimes_cache').select('branch_id, movies(match_status)').eq('bookable', true),
  ]);

  const bookableCountByBranch = new Map<string, number>();
  for (const row of bookableRows ?? []) {
    const matchStatus = (row.movies as unknown as { match_status: string } | null)?.match_status;
    if (matchStatus !== 'matched' && matchStatus !== 'unmatched') continue;
    bookableCountByBranch.set(row.branch_id, (bookableCountByBranch.get(row.branch_id) ?? 0) + 1);
  }

  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] max-w-[200vw] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8">
        <h1
          className="font-display text-4xl leading-none tracking-wide uppercase sm:text-6xl lg:text-7xl"
          style={{ color: 'var(--ink)' }}
        >
          Available cinemas
        </h1>
      </div>

      <div className="relative mx-auto max-w-5xl px-4 pb-10 sm:px-6 sm:pb-14">
        <div className="flex flex-col gap-6">
          {(branches ?? []).map((branch) => (
            <div
              key={branch.id}
              className="poster-card group relative flex flex-col overflow-hidden rounded-lg sm:flex-row"
              style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
            >
              <Link
                href={`/cinemas/${branch.id}`}
                className="absolute inset-0 z-0 rounded-lg"
                aria-label={branch.name}
              />

              <div
                className="pointer-events-none relative h-28 shrink-0 sm:h-auto sm:w-64"
                style={{ background: '#000000' }}
              >
                <Image
                  src="/SceneCinemasLogo.jpg"
                  alt="Scene Cinemas"
                  fill
                  sizes="(max-width: 640px) 100vw, 256px"
                  className="object-contain p-6 sm:p-8"
                />
              </div>

              <div className="pointer-events-none relative flex flex-1 flex-col gap-2 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    className="font-display text-2xl leading-tight uppercase sm:text-3xl"
                    style={{ color: 'var(--ink)' }}
                  >
                    {branch.name}
                  </h2>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}
                  >
                    <ArrowRightIcon size={16} />
                  </div>
                </div>

                <p className="text-sm" style={{ color: 'var(--accent)' }}>
                  {bookableCountByBranch.get(branch.id) ?? 0} movies bookable now
                </p>

                {branch.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name} Scene Cinemas, ${branch.address}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pointer-events-auto relative z-10 flex w-fit items-start gap-1.5 hover:opacity-80"
                  >
                    <MapPinIcon
                      size={14}
                      className="mt-0.5 shrink-0"
                      style={{ color: 'var(--ink-dim)' }}
                    />
                    <span className="text-xs tracking-wide underline" style={{ color: 'var(--ink-dim)' }}>
                      {branch.address}
                    </span>
                  </a>
                )}

                {branch.formats && branch.formats.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {branch.formats.map((format: string) => (
                      <span
                        key={format}
                        className="rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase"
                        style={{
                          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: 'var(--accent)',
                        }}
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {(branches ?? []).length === 0 && (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No cinemas found.
          </p>
        )}

        <p className="mt-8 text-xs" style={{ color: 'var(--ink-dim)' }}>
          Looking for a specific movie instead?{' '}
          <Link href="/browse" className="underline" style={{ color: 'var(--accent-dim)' }}>
            Browse what&apos;s showing
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
