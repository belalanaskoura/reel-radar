import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { fetchMovieDetails, fetchCredits, fetchPersonImdbId } from '@/lib/tmdb';
import { posterUrl, backdropUrl, profileUrl } from '@/lib/tmdb-image';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { filterFutureDates, filterFutureIsoDates } from '@/lib/scene/dates';
import { chainForBranch, voxBranchShowtimesUrl, type VoxBranchId, type VoxDayDetail } from '@/lib/branches';
import { getFallbackCredits, type CreditsCastMember } from '@/lib/matching/credits';
import { WatchlistButton } from '@/components/WatchlistButton';
import { ShowtimePicker } from '@/components/ShowtimePicker';
import { VoxShowtimePicker } from '@/components/VoxShowtimePicker';
import { MovieDetailTabs } from '@/components/MovieDetailTabs';

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Independent of each other (the movie lookup doesn't need `user`), so
  // run concurrently rather than as two sequential round-trips.
  const [
    {
      data: { user },
    },
    { data: movieRow },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('movies')
      .select(
        `id, tmdb_id, title, release_date, poster_path,
         movie_branch_slugs (branch_id, slug, branches (name)),
         showtimes_cache (branch_id, bookable, raw_showtimes, branches (name))`,
      )
      .eq('id', id)
      .maybeSingle(),
  ]);

  if (!movieRow) notFound();
  const movie = movieRow as unknown as MovieRow;

  let isWatchlisted = false;
  if (user) {
    const { data: watchlistRow } = await supabase
      .from('watchlist')
      .select('movie_id')
      .eq('user_id', user.id)
      .eq('movie_id', movie.id)
      .maybeSingle();
    isWatchlisted = !!watchlistRow;
  }

  const [details, tmdbCredits] = movie.tmdb_id
    ? await Promise.all([
        fetchMovieDetails(movie.tmdb_id).catch(() => null),
        fetchCredits(movie.tmdb_id).catch(() => null),
      ])
    : [null, null];

  const tmdbDirector = tmdbCredits?.crew.find((c) => c.job === 'Director');
  const hasTmdbCredits = !!tmdbDirector || (tmdbCredits?.cast.length ?? 0) > 0;

  // TMDB is the primary credits source (names, characters, and photos:
  // the richest of the three). When it has nothing, elCinema is tried
  // next, then Scene Cinemas; see src/lib/matching/credits.ts for why
  // that order and what each source is missing relative to TMDB.
  const fallbackCredits = !hasTmdbCredits
    ? await getFallbackCredits(movie.title, movie.movie_branch_slugs).catch(() => null)
    : null;

  const director = tmdbDirector?.name ?? fallbackCredits?.director ?? null;
  const cast: CreditsCastMember[] = hasTmdbCredits
    ? (tmdbCredits?.cast ?? []).slice(0, 12).map((c) => ({
        name: c.name,
        character: c.character || null,
        photoUrl: profileUrl(c.profile_path),
        tmdbPersonId: c.id,
      }))
    : (fallbackCredits?.cast ?? []);
  const creditsSource = hasTmdbCredits ? null : (fallbackCredits?.source ?? null);

  // Real IMDb profile links (imdb.com/name/nm...) instead of a name
  // search, for every person with a TMDB person id -- elCinema/Scene
  // fallback credits have no id at all and keep using a search link
  // (built client-side in MovieDetailTabs). Fetched in parallel so the
  // up-to-13 extra TMDB calls don't add up in wall-clock time; each is
  // independently best-effort (fetchPersonImdbId never throws), so one
  // failed/unmatched lookup can't take down the rest of the cast's links.
  const personIdsToResolve = [
    ...(tmdbDirector ? [tmdbDirector.id] : []),
    ...cast.map((c) => c.tmdbPersonId).filter((id): id is number => id != null),
  ];
  const imdbIdEntries = await Promise.all(
    personIdsToResolve.map(async (personId) => [personId, await fetchPersonImdbId(personId)] as const),
  );
  const imdbIdByPersonId = new Map(imdbIdEntries);
  const directorImdbId = tmdbDirector ? (imdbIdByPersonId.get(tmdbDirector.id) ?? null) : null;
  const castWithImdbIds: CreditsCastMember[] = cast.map((c) => ({
    ...c,
    imdbId: c.tmdbPersonId != null ? (imdbIdByPersonId.get(c.tmdbPersonId) ?? null) : null,
  }));

  const backdrop = backdropUrl(details?.backdrop_path ?? null);
  const poster = posterUrl(details?.poster_path ?? movie.poster_path);
  const isBookable = movie.showtimes_cache.some((c) => c.bookable);
  const showWatchlistControl = !!user && (isWatchlisted || !isBookable);
  const releaseDate = movie.release_date ?? details?.release_date ?? null;
  const releaseYear = releaseDate ? releaseDate.slice(0, 4) : null;

  const showtimes = (
    <>
      {movie.showtimes_cache.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          Not listed yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {movie.showtimes_cache.map((cache) => {
            const slugRow = movie.movie_branch_slugs.find(
              (s) => s.branch_id === cache.branch_id,
            );
            const branchName = cache.branches?.name ?? cache.branch_id;
            const isVox = chainForBranch(cache.branch_id) === 'vox';
            const futureDates =
              !isVox && Array.isArray(cache.raw_showtimes)
                ? filterFutureDates(cache.raw_showtimes as string[])
                : [];
            // VOX rows store real per-day showtime detail (see
            // scrape-vox), not a plain date array like Scene -- filter to
            // future days and keep only the matching detail objects.
            const voxDays: VoxDayDetail[] = isVox && Array.isArray(cache.raw_showtimes)
              ? filterFutureIsoDates(
                  (cache.raw_showtimes as VoxDayDetail[]).map((d) => d.date),
                )
                  .map((date) => (cache.raw_showtimes as VoxDayDetail[]).find((d) => d.date === date))
                  .filter((d): d is VoxDayDetail => !!d)
              : [];
            return (
              <li
                key={cache.branch_id}
                className="rounded-sm border p-3"
                style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
              >
                <p className="mb-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {branchName}
                </p>
                {cache.bookable ? (
                  isVox ? (
                    voxDays.length > 0 ? (
                      <VoxShowtimePicker
                        days={voxDays}
                        branchShowtimesUrl={voxBranchShowtimesUrl(cache.branch_id as VoxBranchId)}
                      />
                    ) : (
                      <a
                        href={voxBranchShowtimesUrl(cache.branch_id as VoxBranchId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-sm px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
                        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                      >
                        View on VOX Cinemas&rsquo; site &rarr;
                      </a>
                    )
                  ) : slugRow && futureDates.length > 0 ? (
                    <>
                      <p className="mb-2 text-xs" style={{ color: 'var(--ok-ink)' }}>
                        Bookable, pick a day
                      </p>
                      <ShowtimePicker
                        branchId={cache.branch_id}
                        slug={slugRow.slug}
                        dates={futureDates}
                      />
                    </>
                  ) : slugRow ? (
                    <a
                      href={sceneMovieUrl(cache.branch_id, slugRow.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-sm px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
                      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      Select showtime on Scene &rarr;
                    </a>
                  ) : null
                ) : (
                  <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                    Listed, not bookable yet
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return (
    <main>
      <div
        className="relative aspect-video max-h-[70vh] min-h-64 w-full overflow-hidden sm:min-h-96"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-top opacity-60"
          />
        )}
        {/* Fixed-dark scrim, independent of the light/dark theme tokens:
            the title/year/director text sitting on top is always white,
            so the gradient behind it must always be dark for contrast,
            even in light mode where var(--bg) is pale and would wash
            the text out. Only the very bottom sliver blends into the
            page's real --bg so the transition into the content below
            still respects the active theme. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, transparent 20%, rgba(6,8,8,0.92) 96%), linear-gradient(0deg, var(--bg) 0%, transparent 12%)',
          }}
        />

        <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-5xl items-end gap-4 px-4 pb-4 sm:gap-6 sm:px-6 sm:pb-6">
          <div
            className="relative aspect-[2/3] w-20 flex-shrink-0 overflow-hidden rounded-sm shadow-lg sm:w-36"
            style={{ background: 'var(--listed-bg)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
          >
            {poster && <Image src={poster} alt={movie.title} fill sizes="150px" className="object-cover" />}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1">
            <h1
              className="font-display text-2xl leading-[0.95] break-words sm:text-5xl"
              style={{ color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}
            >
              {movie.title}
            </h1>
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums sm:text-sm"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              {releaseYear && <span>{releaseYear}</span>}
              {director && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span>Directed by {director}</span>
                </>
              )}
              {details?.runtime ? (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span>{details.runtime} min</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <MovieDetailTabs
          overview={details?.overview ?? null}
          tagline={details?.tagline ?? null}
          cast={castWithImdbIds}
          creditsSource={creditsSource}
          showtimes={showtimes}
          watchlistControl={
            showWatchlistControl ? (
              <WatchlistButton movieId={movie.id} isWatchlisted={isWatchlisted} />
            ) : null
          }
          details={{
            director,
            directorImdbId,
            runtime: details?.runtime ?? null,
            genres: details?.genres?.map((g) => g.name) ?? [],
            productionCompanies: details?.production_companies?.map((c) => c.name) ?? [],
            releaseDate,
            isBookable,
          }}
        />
      </div>
    </main>
  );
}

function sceneMovieUrl(branchId: string, slug: string): string {
  return `${BRANCH_BASE_URLS[branchId as BranchId] ?? ''}/movie-details/${slug}.html`;
}

interface MovieRow {
  id: string;
  tmdb_id: number | null;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  movie_branch_slugs: { branch_id: string; slug: string; branches: { name: string } | null }[];
  showtimes_cache: {
    branch_id: string;
    bookable: boolean;
    raw_showtimes: unknown;
    branches: { name: string } | null;
  }[];
}
