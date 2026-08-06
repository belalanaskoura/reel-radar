import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MapPinIcon, ArrowRightIcon } from '@/components/icons';

export default async function CinemasPage() {
  const supabase = await createClient();

  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, base_url, address, formats')
    .order('id', { ascending: true });

  // Bookable-movie count per branch, computed live rather than cached on
  // `branches` itself: showtimes_cache is the source of truth (same table
  // /browse and the poll job read), and a plain count query here is cheap
  // -- no need to duplicate it into a denormalized column that could drift.
  const counts = await Promise.all(
    (branches ?? []).map(async (b) => {
      const { count } = await supabase
        .from('showtimes_cache')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', b.id)
        .eq('bookable', true);
      return [b.id, count ?? 0] as const;
    }),
  );
  const bookableCountByBranch = new Map(counts);

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
        <p className="mt-3 max-w-xl text-sm sm:text-base" style={{ color: 'var(--ink-dim)' }}>
          Both Scene Cinemas branches this app tracks. Pick one to see it on Scene&apos;s own site.
        </p>
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
                className="pointer-events-none relative flex h-40 shrink-0 items-center justify-center p-8 sm:h-auto sm:w-64"
                style={{ background: '#000000' }}
              >
                <Image
                  src="/SceneCinemasLogo.jpg"
                  alt="Scene Cinemas"
                  width={160}
                  height={80}
                  className="h-auto w-full object-contain"
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
