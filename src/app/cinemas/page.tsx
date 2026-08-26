import Image from 'next/image';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { MapPinIcon, ArrowRightIcon } from '@/components/icons';
import { sortBranchesForDisplay, type VoxDayDetail } from '@/lib/branches';
import { CinemaFollowButton } from '@/components/CinemaFollowButton';

// Branches and bookable counts are identical for every viewer -- unlike
// followedBranchIds below, which is genuinely per-user and stays live.
// Same reasoning/pattern as /browse's getCachedCatalog: caching only this
// shared slice (not the whole page, which reads cookies via getUser())
// avoids the personalization-leak risk a page-level revalidate would
// carry, while still cutting this page's two DB round-trips to once per
// 60s across every viewer -- negligible staleness against the scraper
// jobs' own ~30min real update cadence. Uses the service-role client
// deliberately (see getCachedCatalog's comment for why) -- branches and
// showtimes_cache are both public-read tables per their RLS policies.
const getCachedCinemas = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    // Branches and bookable counts fetched concurrently rather than
    // sequentially, and the counts come from one query grouped client-side
    // instead of one round-trip per branch -- showtimes_cache is still the
    // source of truth (same table /browse and the poll job read), just
    // queried once instead of N+1 times.
    //
    // Joined through to movies.match_status and filtered the same way the
    // per-branch page (/cinemas/[id]) and /browse already do: 'ambiguous'
    // is allowed through when the movie has a real bookable showtimes_cache
    // row (Scene genuinely lists it, regardless of whether TMDB matching
    // resolved cleanly) -- matching /cinemas/[id]'s rule exactly, since a
    // stricter filter here previously undercounted relative to what the
    // branch detail page actually showed for the same branch.
    const [{ data: branches }, { data: bookableRows }] = await Promise.all([
      supabase
        .from('branches')
        .select('id, name, base_url, address, formats, chain, logo_url')
        .order('id', { ascending: true }),
      supabase
        .from('showtimes_cache')
        .select('branch_id, raw_showtimes, movies(match_status)')
        .eq('bookable', true),
    ]);
    return { branches: branches ?? [], bookableRows: bookableRows ?? [] };
  },
  ['cinemas-list'],
  { revalidate: 60 },
);

export default async function CinemasPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { branches, bookableRows },
  ] = await Promise.all([supabase.auth.getUser(), getCachedCinemas()]);

  const followedRows = user
    ? await supabase.from('cinema_follows').select('branch_id').eq('user_id', user.id)
    : { data: null };

  const followedBranchIds = new Set((followedRows.data ?? []).map((r) => r.branch_id as string));

  const bookableCountByBranch = new Map<string, number>();
  // Scene's format tags come from branches.formats, populated by the
  // dedicated scrape-formats cron job -- but that job only ever calls
  // Scene's own fetchDayShowtimes, so VOX branches always had formats: [].
  // VOX's real per-format detail already lives in showtimes_cache.raw_showtimes
  // (scrape-vox's VoxDayDetail shape, see src/lib/branches.ts), so derive
  // VOX's tags from there at read time instead of scraping anything new.
  const voxFormatsByBranch = new Map<string, Set<string>>();
  for (const row of bookableRows ?? []) {
    const matchStatus = (row.movies as unknown as { match_status: string } | null)?.match_status;
    if (!['matched', 'unmatched', 'ambiguous'].includes(matchStatus ?? '')) continue;
    bookableCountByBranch.set(row.branch_id, (bookableCountByBranch.get(row.branch_id) ?? 0) + 1);

    if (Array.isArray(row.raw_showtimes)) {
      const days = row.raw_showtimes as unknown as VoxDayDetail[];
      const set = voxFormatsByBranch.get(row.branch_id) ?? new Set<string>();
      for (const day of days) {
        for (const f of day.formats ?? []) set.add(f.format);
      }
      if (set.size > 0) voxFormatsByBranch.set(row.branch_id, set);
    }
  }

  const orderedBranches = sortBranchesForDisplay(branches ?? []).map((branch) => {
    const voxFormats = voxFormatsByBranch.get(branch.id);
    if (!voxFormats) return branch;
    return { ...branch, formats: [...voxFormats].sort() };
  });

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
          {orderedBranches.map((branch) => (
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
                {branch.logo_url ? (
                  <Image
                    src={branch.logo_url}
                    alt={branch.chain === 'vox' ? 'VOX Cinemas' : 'Scene Cinemas'}
                    fill
                    sizes="(max-width: 640px) 100vw, 256px"
                    className="object-contain p-6 sm:p-8"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span
                      className="font-display text-lg tracking-widest uppercase"
                      style={{ color: 'var(--ink-dim)' }}
                    >
                      {branch.chain === 'vox' ? 'VOX Cinemas' : 'Scene Cinemas'}
                    </span>
                  </div>
                )}
              </div>

              <div className="pointer-events-none relative flex flex-1 flex-col gap-2 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    className="font-display text-2xl leading-tight uppercase sm:text-3xl"
                    style={{ color: 'var(--ink)' }}
                  >
                    {branch.name}
                  </h2>
                  {user ? (
                    <div className="pointer-events-auto relative z-10">
                      <CinemaFollowButton
                        branchId={branch.id}
                        isFollowing={followedBranchIds.has(branch.id)}
                        variant="icon"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}
                    >
                      <ArrowRightIcon size={16} />
                    </div>
                  )}
                </div>

                <p className="text-sm" style={{ color: 'var(--accent)' }}>
                  {bookableCountByBranch.get(branch.id) ?? 0} movies bookable now
                </p>

                {branch.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name}, ${branch.address}`)}`}
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
