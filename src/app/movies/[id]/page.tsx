import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { fetchMovieDetails, fetchCredits } from '@/lib/tmdb';
import { posterUrl, backdropUrl, profileUrl } from '@/lib/tmdb-image';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { getFallbackCredits, type CreditsCastMember } from '@/lib/matching/credits';
import { WatchlistButton } from '@/components/WatchlistButton';
import { ShowtimePicker } from '@/components/ShowtimePicker';

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: movieRow } = await supabase
    .from('movies')
    .select(
      `id, tmdb_id, title, release_date, poster_path,
       movie_branch_slugs (branch_id, slug, branches (name)),
       showtimes_cache (branch_id, bookable, raw_showtimes, branches (name))`,
    )
    .eq('id', id)
    .maybeSingle();

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
      }))
    : (fallbackCredits?.cast ?? []);
  const creditsSource = hasTmdbCredits ? null : fallbackCredits?.source;

  const backdrop = backdropUrl(details?.backdrop_path ?? null);
  const poster = posterUrl(details?.poster_path ?? movie.poster_path);
  const isBookable = movie.showtimes_cache.some((c) => c.bookable);
  const showWatchlistControl = !!user && (isWatchlisted || !isBookable);

  return (
    <main>
      <div
        className="relative aspect-video max-h-[70vh] min-h-56 w-full overflow-hidden sm:min-h-80"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-top opacity-50"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, transparent 40%, var(--bg) 100%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="-mt-16 flex flex-col gap-4 sm:-mt-32 sm:flex-row sm:gap-6">
          <div
            className="relative aspect-[2/3] w-28 flex-shrink-0 overflow-hidden rounded-sm shadow-lg sm:w-48"
            style={{ background: 'var(--listed-bg)' }}
          >
            {poster && <Image src={poster} alt={movie.title} fill sizes="200px" className="object-cover" />}
          </div>

          <div className="flex flex-1 flex-col justify-end gap-2 pb-2">
            <h1 className="font-display text-3xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
              {movie.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums" style={{ color: 'var(--ink-dim)' }}>
              <span>{movie.release_date ?? details?.release_date ?? 'Release date TBA'}</span>
              {details?.runtime ? <span>{details.runtime} min</span> : null}
              {details?.genres && details.genres.length > 0 && (
                <span>{details.genres.map((g) => g.name).join(', ')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-8 pb-16 sm:flex-row">
          <div className="flex-1">
            {details?.tagline && (
              <p className="mb-3 text-sm italic" style={{ color: 'var(--highlight)' }}>
                {details.tagline}
              </p>
            )}
            {details?.overview && (
              <p className="max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>
                {details.overview}
              </p>
            )}

            {showWatchlistControl && (
              <div className="mt-6">
                <WatchlistButton movieId={movie.id} isWatchlisted={isWatchlisted} />
              </div>
            )}

            {(director || cast.length > 0) && (
              <div className="mt-10">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
                    Cast &amp; crew
                  </h2>
                  {creditsSource && (
                    <span className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                      via {creditsSource === 'elcinema' ? 'elCinema' : 'Scene Cinemas'}
                    </span>
                  )}
                </div>
                {director && (
                  <p className="mb-4 text-sm" style={{ color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--ink-dim)' }}>Director</span>{' '}
                    <span className="font-medium">{director}</span>
                  </p>
                )}
                {cast.length > 0 && (
                  <ul className="flex flex-col">
                    {cast.map((member, i) => {
                      const photo = member.photoUrl;
                      return (
                        <li
                          key={`${member.name}-${i}`}
                          className="flex items-center gap-3 border-t py-2.5 first:border-t-0"
                          style={{ borderColor: 'var(--rule)' }}
                        >
                          <div
                            className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full"
                            style={{ background: 'var(--listed-bg)' }}
                          >
                            {photo && (
                              <Image src={photo} alt={member.name} fill sizes="40px" className="object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                              {member.name}
                            </p>
                            {member.character && (
                              <p className="truncate text-xs" style={{ color: 'var(--ink-dim)' }}>
                                {member.character}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="w-full sm:w-72 sm:flex-shrink-0">
            <h2 className="mb-4 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
              Showtimes
            </h2>
            {movie.showtimes_cache.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
                Not yet listed at Scene Cinemas.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {movie.showtimes_cache.map((cache) => {
                  const slugRow = movie.movie_branch_slugs.find(
                    (s) => s.branch_id === cache.branch_id,
                  );
                  const branchName = cache.branches?.name ?? cache.branch_id;
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
                        slugRow && Array.isArray(cache.raw_showtimes) && cache.raw_showtimes.length > 0 ? (
                          <>
                            <p className="mb-2 text-xs" style={{ color: 'var(--ok-ink)' }}>
                              Bookable, pick a day
                            </p>
                            <ShowtimePicker
                              branchId={cache.branch_id}
                              slug={slugRow.slug}
                              dates={cache.raw_showtimes as string[]}
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
          </div>
        </div>
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
