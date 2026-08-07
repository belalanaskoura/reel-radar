import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeftIcon, MapPinIcon } from '@/components/icons';
import { CinemaMovieGrid, type CinemaMovie, type CinemaDate } from '@/components/CinemaMovieGrid';
import { parseSceneDate, filterFutureDates, formatSceneDateLabel } from '@/lib/scene/dates';

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
    supabase.from('branches').select('id, name, base_url, address, formats').eq('id', id).maybeSingle(),
    // Same match_status filter /browse applies: 'ambiguous' rows have no
    // clean, confirmed title yet (Phase 5's manual-review queue) and
    // shouldn't be shown anywhere in the app until resolved, not just on
    // browse.
    supabase
      .from('movie_branch_slugs')
      .select('movie_id, slug, movies(id, title, poster_path, match_status)')
      .eq('branch_id', id),
    supabase.from('showtimes_cache').select('movie_id, bookable, raw_showtimes').eq('branch_id', id),
  ]);

  if (!branch) notFound();

  const cacheByMovieId = new Map((cacheRows ?? []).map((c) => [c.movie_id, c]));

  const movies: CinemaMovie[] = (slugRows ?? []).flatMap((row) => {
    const m = row.movies as unknown as
      | { id: string; title: string; poster_path: string | null; match_status: string }
      | null;
    if (!m) return [];
    if (!['matched', 'unmatched'].includes(m.match_status)) return [];
    const cache = cacheByMovieId.get(m.id);
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
  const allDates = new Set<string>();
  for (const cache of cacheRows ?? []) {
    if (cache.bookable && Array.isArray(cache.raw_showtimes)) {
      for (const d of cache.raw_showtimes as string[]) allDates.add(d);
    }
  }
  const sortedDates = filterFutureDates([...allDates]).sort(
    (a, b) => parseSceneDate(a).getTime() - parseSceneDate(b).getTime(),
  );
  const dates: CinemaDate[] = sortedDates.map((date) => ({ date, label: formatSceneDateLabel(date) }));

  const bookableCount = movies.filter((m) => m.bookable).length;
  const branchShortName = branch.id === 'cfc' ? 'CFC' : branch.name;

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
        </div>

        <CinemaMovieGrid
          branchId={branch.id}
          branchShortName={branchShortName}
          movies={movies}
          dates={dates}
        />

        {branch.address && (
          <div className="mt-10 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl tracking-wide uppercase" style={{ color: 'var(--ink)' }}>
                Find us
              </h2>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.name} Scene Cinemas, ${branch.address}`)}`}
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
          href={branch.base_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block text-xs underline"
          style={{ color: 'var(--accent-dim)' }}
        >
          View {branch.name} on Scene Cinemas&apos; site
        </a>
      </div>
    </main>
  );
}
