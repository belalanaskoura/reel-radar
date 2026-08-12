'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import type { CreditsCastMember } from '@/lib/matching/credits';
import type { OmdbRatings } from '@/lib/omdb';
import type { TmdbReview } from '@/lib/tmdb';

type TabId = 'overview' | 'cast' | 'showtimes' | 'reviews';

// TMDB-sourced people are resolved to a real IMDb id server-side (see
// movies/[id]/page.tsx, one extra /person/{id} call each) and link
// straight to their profile. elCinema/Scene fallback credits have no id
// at all, just a name -- those, and any TMDB person whose lookup didn't
// resolve, fall back to an IMDb name-scoped search (s=nm) instead.
function imdbUrl(name: string, imdbId: string | null | undefined): string {
  return imdbId
    ? `https://www.imdb.com/name/${imdbId}/`
    : `https://www.imdb.com/find/?q=${encodeURIComponent(name)}&s=nm`;
}

interface DetailsInfo {
  director: string | null;
  directorImdbId: string | null;
  runtime: number | null;
  genres: string[];
  productionCompanies: string[];
  releaseDate: string | null;
  isBookable: boolean;
}

function ReviewCard({ review }: { review: TmdbReview }) {
  const [expanded, setExpanded] = useState(false);
  // Spoiler gate defaults closed independent of the length-clamp state --
  // a spoiler-flagged review starts both un-revealed AND (once revealed)
  // still subject to the normal Read more/Show less clamp below, rather
  // than dumping the full text the instant someone opts in.
  const [spoilersRevealed, setSpoilersRevealed] = useState(false);
  // Whether the clamp is actually cutting text off, measured from the
  // real DOM element rather than guessed from character count -- a fixed
  // character threshold doesn't track visual line count at all (depends
  // on container width, font size, and where words happen to wrap), so
  // it was showing "Read more" on reviews that weren't actually clamped
  // and hiding it on shorter ones (e.g. with manual line breaks) that
  // were. Re-measured on window resize since the clamp is width-dependent.
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (!el) return;

    function measure() {
      if (el) setIsClamped(el.scrollHeight > el.clientHeight + 1);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [expanded, review.content]);

  const isGated = review.hasSpoilers && !spoilersRevealed;

  return (
    <li
      className="rounded-sm border p-4"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={review.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-semibold underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
            style={{ color: 'var(--ink)' }}
          >
            {review.author}
          </a>
          <span
            className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
            style={{ background: 'var(--listed-bg)', color: 'var(--listed-ink)' }}
          >
            TMDB
          </span>
          {review.hasSpoilers && (
            <span
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
              style={{ background: 'color-mix(in srgb, var(--error-ink) 15%, transparent)', color: 'var(--error-ink)' }}
            >
              Spoilers
            </span>
          )}
        </div>
        {review.authorRating != null && (
          <span
            className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--listed-bg)', color: 'var(--listed-ink)' }}
          >
            {review.authorRating}/10
          </span>
        )}
      </div>

      {isGated ? (
        <div
          className="flex flex-col items-start gap-2 rounded-sm border border-dashed p-3"
          style={{ borderColor: 'var(--rule)' }}
        >
          <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
            This review may contain spoilers.
          </p>
          <button
            type="button"
            onClick={() => setSpoilersRevealed(true)}
            className="cursor-pointer rounded-sm border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
          >
            Show anyway
          </button>
        </div>
      ) : (
        <>
          <p
            ref={textRef}
            className={`text-sm leading-relaxed whitespace-pre-line ${expanded ? '' : 'line-clamp-6'}`}
            style={{ color: 'var(--ink-dim)' }}
          >
            {review.content}
          </p>
          {(isClamped || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 cursor-pointer text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--highlight)' }}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
          <a
            href={review.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-xs underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
            style={{ color: 'var(--accent-dim)' }}
          >
            View full review on TMDB &rarr;
          </a>
        </>
      )}
    </li>
  );
}

function CastCard({ member }: { member: CreditsCastMember }) {
  const photo = member.photoUrl;
  return (
    <a
      href={imdbUrl(member.name, member.imdbId)}
      target="_blank"
      rel="noopener noreferrer"
      className="cast-card block min-w-0 rounded-sm"
    >
      <div
        className="cast-card-photo relative aspect-[2/3] w-full overflow-hidden rounded-sm"
        style={{ background: 'var(--listed-bg)' }}
      >
        {photo ? (
          <Image
            src={photo}
            alt={member.name}
            fill
            sizes="(min-width: 640px) 160px, 33vw"
            className="object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-2xl font-semibold"
            style={{ color: 'var(--listed-ink)' }}
          >
            {member.name.charAt(0)}
          </div>
        )}
      </div>
      <p className="mt-2 truncate text-xs font-semibold sm:text-sm" style={{ color: 'var(--ink)' }}>
        {member.name}
      </p>
      {member.character && (
        <p className="truncate text-[11px] sm:text-xs" style={{ color: 'var(--ink-dim)' }}>
          {member.character}
        </p>
      )}
    </a>
  );
}

export function MovieDetailTabs({
  initialTab = 'overview',
  overview,
  tagline,
  cast,
  creditsSource,
  showtimes,
  ratings,
  reviews,
  details,
  watchlistControl,
}: {
  initialTab?: TabId;
  overview: string | null;
  tagline: string | null;
  cast: CreditsCastMember[];
  creditsSource: 'elcinema' | 'scene' | null;
  showtimes: ReactNode;
  ratings: OmdbRatings | null;
  reviews: TmdbReview[];
  details: DetailsInfo;
  watchlistControl: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'cast', label: 'Cast' },
    { id: 'showtimes', label: 'Showtimes' },
    { id: 'reviews', label: 'Reviews' },
  ];

  return (
    <div>
      <div
        className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
        style={{ borderColor: 'var(--rule)' }}
        role="tablist"
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className="relative flex-shrink-0 cursor-pointer px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors"
              style={{ color: active ? 'var(--ink)' : 'var(--ink-dim)' }}
            >
              {t.label}
              {active && (
                <span
                  className="absolute inset-x-2 -bottom-px h-[3px] rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-6">
        {tab === 'overview' && (
          <div>
            {details.genres.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {details.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: 'var(--listed-bg)', color: 'var(--listed-ink)' }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
            {overview ? (
              <p className="max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>
                {overview}
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
                No synopsis available yet.
              </p>
            )}
            {tagline && (
              <p className="mt-3 text-sm italic" style={{ color: 'var(--highlight)' }}>
                &ldquo;{tagline}&rdquo;
              </p>
            )}

            {(details.director || !!details.runtime || details.releaseDate) && (
              <dl className="mt-5 flex flex-col gap-3 border-t pt-5 text-sm" style={{ borderColor: 'var(--rule)' }}>
                {details.director && (
                  <div className="flex gap-2">
                    <dt className="w-28 flex-shrink-0" style={{ color: 'var(--ink-dim)' }}>
                      Director
                    </dt>
                    <dd>
                      <a
                        href={imdbUrl(details.director, details.directorImdbId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
                      >
                        {details.director}
                      </a>
                    </dd>
                  </div>
                )}
                {details.releaseDate && (
                  <div className="flex gap-2">
                    <dt className="w-28 flex-shrink-0" style={{ color: 'var(--ink-dim)' }}>
                      {details.isBookable ? 'Released' : 'Release date'}
                    </dt>
                    <dd style={{ color: 'var(--ink)' }}>{details.releaseDate}</dd>
                  </div>
                )}
                {!!details.runtime && (
                  <div className="flex gap-2">
                    <dt className="w-28 flex-shrink-0" style={{ color: 'var(--ink-dim)' }}>
                      Runtime
                    </dt>
                    <dd style={{ color: 'var(--ink)' }}>{details.runtime} min</dd>
                  </div>
                )}
                {details.productionCompanies.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-28 flex-shrink-0" style={{ color: 'var(--ink-dim)' }}>
                      Production
                    </dt>
                    <dd style={{ color: 'var(--ink)' }}>{details.productionCompanies.join(', ')}</dd>
                  </div>
                )}
              </dl>
            )}

            {cast.length > 0 && (
              <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--rule)' }}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
                    Top cast
                  </h2>
                  <button
                    type="button"
                    onClick={() => setTab('cast')}
                    className="cursor-pointer text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ color: 'var(--highlight)' }}
                  >
                    View all &rarr;
                  </button>
                </div>
                <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  {cast.slice(0, 6).map((member, i) => (
                    <li key={`${member.name}-${i}`} className="w-20 flex-shrink-0 sm:w-24">
                      <CastCard member={member} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {watchlistControl && <div className="mt-6">{watchlistControl}</div>}
          </div>
        )}

        {tab === 'cast' && (
          <div>
            {creditsSource && (
              <p className="mb-4 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                via {creditsSource === 'elcinema' ? 'elCinema' : 'Scene Cinemas'}
              </p>
            )}
            {cast.length > 0 ? (
              <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                {cast.map((member, i) => (
                  <li key={`${member.name}-${i}`} className="min-w-0">
                    <CastCard member={member} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
                No cast information available yet.
              </p>
            )}
          </div>
        )}

        {tab === 'showtimes' && <div>{showtimes}</div>}

        {tab === 'reviews' && (
          <div className="flex flex-col gap-6">
            {ratings && (ratings.imdbRating || ratings.metascore || ratings.rottenTomatoes) && (
              <div className="flex flex-wrap gap-3">
                {ratings.imdbRating && (
                  <a
                    href={`https://www.imdb.com/title/${ratings.imdbId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-sm border px-3 py-2 transition-opacity hover:opacity-80"
                    style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
                  >
                    <span className="text-xs font-bold tracking-wide" style={{ color: '#f5c518' }}>
                      IMDb
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {ratings.imdbRating}/10
                    </span>
                    {ratings.imdbVotes && (
                      <span className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                        ({ratings.imdbVotes} votes)
                      </span>
                    )}
                  </a>
                )}
                {ratings.metascore && (
                  <div
                    className="flex items-center gap-2 rounded-sm border px-3 py-2"
                    style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
                  >
                    <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--ink-dim)' }}>
                      Metacritic
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {ratings.metascore}/100
                    </span>
                  </div>
                )}
                {ratings.rottenTomatoes && (
                  <div
                    className="flex items-center gap-2 rounded-sm border px-3 py-2"
                    style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
                  >
                    <span className="text-xs font-bold tracking-wide" style={{ color: '#fa320a' }}>
                      Rotten Tomatoes
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {ratings.rottenTomatoes}
                    </span>
                  </div>
                )}
              </div>
            )}

            {reviews.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </ul>
            ) : !ratings?.imdbRating && !ratings?.metascore && !ratings?.rottenTomatoes ? (
              <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
                No ratings or reviews available yet.
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
                No written reviews yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
