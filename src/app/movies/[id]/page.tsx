import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { fetchMovieDetails, fetchCredits } from '@/lib/tmdb';
import { posterUrl, backdropUrl, profileUrl } from '@/lib/tmdb-image';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import { WatchlistButton } from '@/components/WatchlistButton';

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

  const [details, credits] = movie.tmdb_id
    ? await Promise.all([
        fetchMovieDetails(movie.tmdb_id).catch(() => null),
        fetchCredits(movie.tmdb_id).catch(() => null),
      ])
    : [null, null];

  const backdrop = backdropUrl(details?.backdrop_path ?? null);
  const poster = posterUrl(details?.poster_path ?? movie.poster_path);
  const director = credits?.crew.find((c) => c.job === 'Director');
  const topCast = (credits?.cast ?? []).slice(0, 8);

  return (
    <main>
      <div className="relative h-[36vh] min-h-72 w-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        {backdrop && (
          <Image src={backdrop} alt="" fill priority className="object-cover opacity-40" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, var(--bg) 100%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-6">
        <div className="-mt-32 flex gap-6 sm:-mt-40">
          <div
            className="relative aspect-[2/3] w-32 flex-shrink-0 overflow-hidden rounded-sm shadow-lg sm:w-48"
            style={{ background: 'var(--listed-bg)' }}
          >
            {poster && <Image src={poster} alt={movie.title} fill sizes="200px" className="object-cover" />}
          </div>

          <div className="flex flex-1 flex-col justify-end gap-2 pb-2">
            <h1 className="font-display text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
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

            {user && (
              <div className="mt-6">
                <WatchlistButton movieId={movie.id} isWatchlisted={isWatchlisted} />
              </div>
            )}

            {(director || topCast.length > 0) && (
              <div className="mt-10">
                <h2 className="mb-4 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
                  Cast &amp; crew
                </h2>
                {director && (
                  <p className="mb-4 text-sm" style={{ color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--ink-dim)' }}>Director</span>{' '}
                    <span className="font-medium">{director.name}</span>
                  </p>
                )}
                {topCast.length > 0 && (
                  <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8">
                    {topCast.map((actor) => {
                      const photo = profileUrl(actor.profile_path);
                      return (
                        <div key={actor.id} className="flex flex-col gap-1">
                          <div
                            className="relative aspect-square w-full overflow-hidden rounded-full"
                            style={{ background: 'var(--listed-bg)' }}
                          >
                            {photo && (
                              <Image src={photo} alt={actor.name} fill sizes="80px" className="object-cover" />
                            )}
                          </div>
                          <p className="line-clamp-1 text-xs font-medium" style={{ color: 'var(--ink)' }}>
                            {actor.name}
                          </p>
                          <p className="line-clamp-1 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                            {actor.character}
                          </p>
                        </div>
                      );
                    })}
                  </div>
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
                        <>
                          <p className="mb-2 text-xs" style={{ color: 'var(--ok-ink)' }}>
                            Bookable
                            {Array.isArray(cache.raw_showtimes) && cache.raw_showtimes.length > 0 && (
                              <span className="tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                                {' '}
                                ({cache.raw_showtimes.join(', ')})
                              </span>
                            )}
                          </p>
                          {slugRow && (
                            <a
                              href={sceneMovieUrl(cache.branch_id, slugRow.slug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block rounded-sm px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
                              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                            >
                              Select showtime on Scene &rarr;
                            </a>
                          )}
                        </>
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
