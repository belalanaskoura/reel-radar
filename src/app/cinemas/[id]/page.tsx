import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeftIcon, MapPinIcon } from '@/components/icons';
import { CinemaMovieGrid, type CinemaMovie, type CinemaDate } from '@/components/CinemaMovieGrid';
import { parseSceneDate, filterFutureDates, formatSceneDateLabel } from '@/lib/scene/dates';
import { voxBranchShowtimesUrl, type VoxBranchId, type VoxDayDetail } from '@/lib/branches';
import { logPageView } from '@/lib/analytics';

export default async function CinemaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // All three filter on `id` alone (the route param, known upfront) --
  // none actually depends on another's result, so they run concurrently
  // instead of as three sequential round-trips.
  const [{ data: branch }, { data: slugRows }, { data: cacheRows }] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name, base_url, address, formats, chain, logo_url')
      .eq('id', id)
      .maybeSingle(),
    // Same match_status filter /browse applies: 'ambiguous' rows have no
    // clean, confirmed title yet (Phase 5's manual-review queue) and
    // shouldn't be shown anywhere in the app until resolved, not just on
    // browse.
    supabase
      .from('movie_branch_slugs')
      .select('movie_id, slug, movies(id, title, poster_path, match_status, release_date)')
      .eq('branch_id', id),
    supabase
      .from('showtimes_cache')
      .select('movie_id, bookable, was_ever_bookable, raw_showtimes')
      .eq('branch_id', id),
  ]);

  if (!branch) notFound();

  logPageView(`/cinemas/${id}`, { branch_id: id });

  const cacheByMovieId = new Map((cacheRows ?? []).map((c) => [c.movie_id, c]));

  // Same grace window /browse applies to a dead Scene listing (created a
  // page but never posted real showtimes) -- Scene occasionally lags a
  // few days behind the official release date, so this isn't "hide the
  // instant release_date passes."
  const STALE_LISTING_GRACE_DAYS = 7;
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - STALE_LISTING_GRACE_DAYS);
  const staleCutoffStr = staleCutoff.toISOString().slice(0, 10);

  const movies: CinemaMovie[] = (slugRows ?? []).flatMap((row) => {
    const m = row.movies as unknown as
      | { id: string; title: string; poster_path: string | null; match_status: string; release_date: string | null }
      | null;
    if (!m) return [];
    // 'ambiguous' is allowed through here too, matching /browse's rule:
    // a row reaching this point already has a real movie_branch_slugs
    // link for this branch, i.e. Scene genuinely lists it, regardless of
    // whether TMDB matching resolved cleanly.
    if (!['matched', 'unmatched', 'ambiguous'].includes(m.match_status)) return [];
    const cache = cacheByMovieId.get(m.id);
    // Same "run ended" rule /browse applies: was_ever_bookable is a
    // one-way flag set by a DB trigger the instant bookable is ever
    // written true, so a movie that was once bookable here but isn't now
    // has finished its run at this branch, not just yet to open -- excluded
    // rather than shown as a currently-listed movie.
    const hasEndedHere = !!cache?.was_ever_bookable && !cache?.bookable;
    // Same "stale listing" rule /browse applies: never bookable here at
    // all, well past its release_date -- a dead listing rather than
    // "coming soon." No release_date is left alone (Arabic-title-matching
    // gap or an unconfirmed TMDB date, not evidence of a dead entry).
    const isStaleListing =
      !cache?.was_ever_bookable && !!m.release_date && m.release_date < staleCutoffStr;
    if (hasEndedHere || isStaleListing) return [];
    return [{
      id: m.id,
      title: m.title,
      poster_path: m.poster_path,
      slug: row.slug,
      bookable: cache?.bookable ?? false,
    }];
  });

  // The date picker shows real dates this branch actually has a bookable
  // showtime on: the union of every bookable movie's cached available
  // dates, deduplicated and sorted -- not a fixed "next 5 days" window,
  // since a branch's actual bookable range varies by what's playing.
  // Scene-only: VOX's showtimes_cache.raw_showtimes holds real per-day
  // showtime detail objects, not a plain date string[] (see
  // src/lib/branches.ts's VoxDayDetail) -- CinemaMovieGrid's date-tab
  // picker this feeds is already gated to chain === 'scene', so this
  // stays empty for VOX branches rather than trying to parse VOX's shape
  // as a Scene date.
  const allDates = new Set<string>();
  if (branch.chain !== 'vox') {
    for (const cache of cacheRows ?? []) {
      if (cache.bookable && Array.isArray(cache.raw_showtimes)) {
        for (const d of cache.raw_showtimes as string[]) allDates.add(d);
      }
    }
  }
  const sortedDates = filterFutureDates([...allDates]).sort(
    (a, b) => parseSceneDate(a).getTime() - parseSceneDate(b).getTime(),
  );
  const dates: CinemaDate[] = sortedDates.map((date) => ({ date, label: formatSceneDateLabel(date) }));

  const bookableCount = movies.filter((m) => m.bookable).length;
  const branchShortName = branch.id === 'cfc' ? 'CFC' : branch.name;

  // Same derivation as /cinemas: Scene's formats come from branches.formats
  // (scrape-formats), but that job never touches VOX, so VOX's tags are
  // derived here from showtimes_cache.raw_showtimes instead (already
  // populated by scrape-vox, no extra scraping needed).
  let displayFormats: string[] = branch.formats ?? [];
  if (branch.chain === 'vox') {
    const voxFormats = new Set<string>();
    for (const cache of cacheRows ?? []) {
      if (!cache.bookable || !Array.isArray(cache.raw_showtimes)) continue;
      const days = cache.raw_showtimes as unknown as VoxDayDetail[];
      for (const day of days) {
        for (const f of day.formats ?? []) voxFormats.add(f.format);
      }
    }
    displayFormats = [...voxFormats].sort();
  }

  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] max-w-[200vw] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-6 pb-10 sm:px-6 sm:pb-14">
        <Link
          href="/cinemas"
          className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--ink-dim)' }}
        >
          <ArrowLeftIcon size={15} />
          All cinemas
        </Link>

        <div
          className="mb-8 flex flex-col gap-1 rounded-lg p-6 sm:p-8"
          style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
        >
          <h1
            className="font-display text-4xl leading-none uppercase sm:text-6xl"
            style={{ color: 'var(--ink)' }}
          >
            {branch.name}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-dim)' }}>
            {bookableCount} movie{bookableCount === 1 ? '' : 's'} bookable now
          </p>

          {displayFormats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {displayFormats.map((format) => (
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

        <CinemaMovieGrid
          branchId={branch.id}
          branchShortName={branchShortName}
          movies={movies}
          dates={dates}
          chain={branch.chain === 'vox' ? 'vox' : 'scene'}
        />

        {branch.address && (
          <div className="mt-10 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl tracking-wide uppercase" style={{ color: 'var(--ink)' }}>
                Location
              </h2>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name}, ${branch.address}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg p-4 transition-opacity hover:opacity-80"
              style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--rule)' }}
            >
              <MapPinIcon size={18} style={{ color: 'var(--accent)' }} />
              <span className="text-sm underline" style={{ color: 'var(--ink)' }}>
                {branch.address}
              </span>
              <span className="ml-auto text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--accent-dim)' }}>
                Open in Maps
              </span>
            </a>
          </div>
        )}

        <a
          href={branch.chain === 'vox' ? voxBranchShowtimesUrl(branch.id as VoxBranchId) : branch.base_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block text-xs underline"
          style={{ color: 'var(--accent-dim)' }}
        >
          View {branch.name} on {branch.chain === 'vox' ? "VOX Cinemas'" : "Scene Cinemas'"} site
        </a>
      </div>
    </main>
  );
}
