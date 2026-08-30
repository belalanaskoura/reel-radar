import { unstable_cache } from 'next/cache';
import { containsSpoilers } from '@/lib/spoiler-detection';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Movie metadata (overview, cast, reviews) changes on the order of days,
// not minutes -- but every call in this file that's reachable from
// src/app/movies/[id]/page.tsx was, until this, a fresh live TMDB
// round-trip on every single page view, including two views of the same
// movie back to back. A detail page view fires 4 calls up front plus up
// to 13 more (one fetchPersonImdbId per cast/crew member) -- all
// parallelized, so wall-clock cost is bounded by the slowest one, but
// that's still a real external round-trip nobody needed to repeat.
// 24h keeps this fresh enough for metadata that rarely changes at all,
// while cutting the common case (the same handful of currently-bookable
// movies getting most of the traffic) from N TMDB calls to ~1 per movie
// per day across every viewer.
const DETAIL_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24;

// Every other external fetch in this codebase (Scene, elCinema, Resend)
// already aborts a hanging request rather than letting it run until
// Vercel's own hard function limit -- this file was the one outlier, with
// every one of its ~10 fetch() calls left bare. sync-movies and
// match-movies make the most external calls of any scheduled job, so a
// slow/hanging TMDB response there could burn an entire cron slot with no
// partial-progress logging.
const TMDB_TIMEOUT_MS = 15_000;

// No evidence TMDB's rate limit has ever actually been hit in this app
// (this is a speculative gap being closed ahead of time, not a fix for a
// confirmed incident) -- but sync-movies and match-movies both loop over
// many movies through this same choke point, so a real 429 under load
// would otherwise fail every remaining candidate in the batch the same
// way an unhandled error does anywhere else in those routes. One retry
// only: this isn't a general-purpose backoff loop, just enough to survive
// a single transient rate-limit response without adding real latency to
// the common case where it's never hit.
const RATE_LIMIT_RETRY_DELAY_MS = 1_000;

// Every `path` this file ever passes in is a literal template with only
// numeric ids interpolated (e.g. `/movie/${tmdbId}/credits`) -- this
// guard enforces that shape at runtime so a path can never smuggle a
// scheme or host of its own (e.g. "https://evil.example/") into
// new URL()'s resolution against TMDB_BASE_URL, even though no current
// caller does this. Every id interpolated into a path already comes from
// a numeric TMDB id or an IMDb id matching TMDB's own tt\d+ format, so
// this also can't reject any real, legitimate call.
const SAFE_PATH_PATTERN = /^\/[A-Za-z0-9/_-]*$/;

// Takes `path` and `params` separately (rather than a pre-built URL
// string) so the request's destination is always the literal
// TMDB_BASE_URL -- every value that varies per call (movie/person ids,
// search queries) only ever lands in the query string, never the host.
//
// Deliberately NOT `new URL(path, TMDB_BASE_URL)`: with a leading-slash
// `path` (e.g. "/movie/123"), WHATWG URL resolution treats that as
// absolute-from-origin and discards TMDB_BASE_URL's own "/3" path
// segment entirely, silently producing
// "https://api.themoviedb.org/movie/123" instead of
// ".../3/movie/123" -- a real regression this caused in production
// (every call 404ing, api_key and all). String concatenation has no
// such resolution step, so it can't repeat that failure mode.
function buildUrl(path: string, params: URLSearchParams): string {
  if (!SAFE_PATH_PATTERN.test(path)) {
    throw new Error(`Refusing to build TMDB request for unexpected path: ${path}`);
  }
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.search = params.toString();
  return url.toString();
}

async function fetchOnce(path: string, params: URLSearchParams): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);
  try {
    return await fetch(buildUrl(path, params), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function tmdbFetch(path: string, params: URLSearchParams): Promise<Response> {
  const res = await fetchOnce(path, params);
  if (res.status !== 429) return res;

  const retryAfterHeader = res.headers.get('Retry-After');
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
  const delayMs = Number.isFinite(retryAfterMs) ? retryAfterMs : RATE_LIMIT_RETRY_DELAY_MS;

  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return fetchOnce(path, params);
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  release_date: string;
  popularity: number;
  original_language: string;
  genre_ids: number[];
}

// Genre ID for "Documentary" in TMDB's fixed genre list: Egyptian
// cinemas don't screen documentaries, so these are excluded at the
// source rather than filtered client-side.
export const DOCUMENTARY_GENRE_ID = 99;

interface TmdbDiscoverResponse {
  page: number;
  results: TmdbMovie[];
  total_pages: number;
  total_results: number;
}

interface TmdbSearchResponse {
  results: TmdbMovie[];
  total_results: number;
}

interface TmdbReleaseDatesResponse {
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{ release_date: string; type: number }>;
  }>;
}

export interface TmdbProductionCompany {
  id: number;
  name: string;
  origin_country: string;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string;
  tagline: string;
  backdrop_path: string | null;
  poster_path: string | null;
  release_date: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  production_companies: TmdbProductionCompany[];
}

interface TmdbFindResponse {
  movie_results: TmdbMovie[];
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

function requireApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error('Missing TMDB_API_KEY');
  }
  return key;
}

// Fetches upcoming movies likely to matter to an Egypt-based audience.
//
// `region=EG` alone is not a real filter: it only prefers EG release
// dates when TMDB happens to have one, so most results come back obscure
// and near-zero popularity. Sorting by popularity.desc surfaces the
// mainstream titles that actually get released everywhere (including
// Egypt) instead. `with_release_type=2|3` limits to limited theatrical
// and theatrical releases, filtering out digital/TV-only entries.
export async function fetchUpcomingMovies(
  fromDate: string,
  toDate: string,
): Promise<TmdbMovie[]> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
    region: 'EG',
    sort_by: 'popularity.desc',
    'primary_release_date.gte': fromDate,
    'primary_release_date.lte': toDate,
    with_release_type: '2|3',
    language: 'en-US',
    include_adult: 'false',
    without_genres: String(DOCUMENTARY_GENRE_ID),
    // `without_original_language` only accepts a single value (confirmed by
    // testing: unlike with_release_type it does NOT support a pipe-
    // separated OR list), so the multi-language exclusion below happens
    // client-side after fetching instead.
  });

  const results: TmdbMovie[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    params.set('page', String(page));
    const res = await tmdbFetch('/discover/movie', params);
    if (!res.ok) {
      throw new Error(`TMDB discover request failed: ${res.status}`);
    }
    const data: TmdbDiscoverResponse = await res.json();
    results.push(...data.results);
    totalPages = data.total_pages;
    page += 1;
  } while (page <= totalPages && page <= 5); // cap at 5 pages of raw results (~100 movies pre-filter)

  return results;
}

// Searches TMDB for a title in a given language. Used with 'en-US' first,
// then 'ar' as a fallback: Phase 0 found some Arabic-titled Egyptian
// films return zero results in English search entirely.
export async function searchMovies(query: string, language: 'en-US' | 'ar'): Promise<TmdbMovie[]> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    language,
    include_adult: 'false',
  });

  const res = await tmdbFetch('/search/movie', params);
  if (!res.ok) {
    throw new Error(`TMDB search request failed: ${res.status}`);
  }
  const data: TmdbSearchResponse = await res.json();
  return data.results;
}

// Returns a country's THEATRICAL release_date entry for a movie, or null if
// TMDB has no theatrical entry for that country (a digital/TV-only entry
// does not count; confirmed necessary after Moana 2 (a 2024 Disney+
// release) had an EG entry of type 4/digital and was nearly auto-matched
// over the real 2026 theatrical Moana, which had no EG entry at all).
async function getTheatricalReleaseDate(tmdbId: number, country: string): Promise<string | null> {
  const apiKey = requireApiKey();
  const res = await tmdbFetch(
    `/movie/${tmdbId}/release_dates`,
    new URLSearchParams({ api_key: apiKey }),
  );
  if (!res.ok) {
    throw new Error(`TMDB release_dates request failed: ${res.status}`);
  }
  const data: TmdbReleaseDatesResponse = await res.json();
  const entry = data.results.find((r) => r.iso_3166_1 === country);
  if (!entry) return null;
  // type 2 = limited theatrical, 3 = theatrical. Digital (4), physical (5),
  // TV (6), and premiere (1) entries don't indicate a cinema release.
  const theatrical = entry.release_dates.find((d) => d.type === 2 || d.type === 3);
  return theatrical?.release_date ?? null;
}

// Used to disambiguate multi-result searches: Phase 0 found genuine title
// collisions (two different 2026 movies both titled "The Odyssey"), and a
// real EG theatrical date is a stronger signal than popularity alone for
// "this is the one actually playing in Egypt's cinemas."
export function getEgTheatricalReleaseDate(tmdbId: number): Promise<string | null> {
  return getTheatricalReleaseDate(tmdbId, 'EG');
}

// Fallback display date when a movie has no EG (nor elCinema) release date
// yet: TMDB's own top-level `release_date` field is not reliably any
// particular country's date (confirmed for real: "Primetime" resolved to
// Canada's date there, while TMDB's own website prominently shows the US
// date instead) -- the US theatrical date is at least a real, labelable
// anchor rather than an arbitrary one.
export function getUsTheatricalReleaseDate(tmdbId: number): Promise<string | null> {
  return getTheatricalReleaseDate(tmdbId, 'US');
}

// Looks up a movie by IMDb ID: a much more reliable cross-reference
// than title search when the source (elCinema) exposes one, since it's
// an exact match rather than a fuzzy one. Returns null if TMDB has no
// movie for that IMDb ID.
export async function findByImdbId(imdbId: string): Promise<TmdbMovie | null> {
  const apiKey = requireApiKey();
  const res = await tmdbFetch(
    `/find/${imdbId}`,
    new URLSearchParams({ api_key: apiKey, external_source: 'imdb_id' }),
  );
  if (!res.ok) {
    throw new Error(`TMDB find request failed: ${res.status}`);
  }
  const data: TmdbFindResponse = await res.json();
  return data.movie_results[0] ?? null;
}

// Looks up a movie directly by its TMDB id, in the same TmdbMovie shape
// searchMovies()/findByImdbId() return. Used when a tmdb_id is already
// known from another source (e.g. egypt_releases' elcinema_id mapping)
// and a fuzzy title search would just risk landing on the wrong entry.
export async function getMovieById(tmdbId: number): Promise<TmdbMovie | null> {
  const apiKey = requireApiKey();
  const res = await tmdbFetch(
    `/movie/${tmdbId}`,
    new URLSearchParams({ api_key: apiKey, language: 'en-US' }),
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`TMDB movie request failed: ${res.status}`);
  }
  return res.json();
}

// Fetches full movie details (overview, tagline, backdrop, runtime,
// genres) for the detail page. Not stored in the DB: fetched live (see
// DETAIL_CACHE_REVALIDATE_SECONDS above for why "live" is now cached, not
// per-request) since detail pages are viewed far less often than the
// browse grid, so there's no benefit to bloating every `movies` row with
// data most of them will never need rendered.
export const fetchMovieDetails = unstable_cache(
  async (tmdbId: number): Promise<TmdbMovieDetails> => {
    const apiKey = requireApiKey();
    const res = await tmdbFetch(
      `/movie/${tmdbId}`,
      new URLSearchParams({ api_key: apiKey, language: 'en-US' }),
    );
    if (!res.ok) {
      throw new Error(`TMDB movie details request failed: ${res.status}`);
    }
    return res.json();
  },
  ['tmdb-movie-details'],
  { revalidate: DETAIL_CACHE_REVALIDATE_SECONDS },
);

// Fetches cast and crew for the detail page. Same caching reasoning as
// fetchMovieDetails.
export const fetchCredits = unstable_cache(
  async (tmdbId: number): Promise<TmdbCredits> => {
    const apiKey = requireApiKey();
    const res = await tmdbFetch(
      `/movie/${tmdbId}/credits`,
      new URLSearchParams({ api_key: apiKey, language: 'en-US' }),
    );
    if (!res.ok) {
      throw new Error(`TMDB credits request failed: ${res.status}`);
    }
    return res.json();
  },
  ['tmdb-credits'],
  { revalidate: DETAIL_CACHE_REVALIDATE_SECONDS },
);

// Looks up a movie's own IMDb id (distinct from fetchPersonImdbId, which
// resolves a cast/crew member's id) -- needed to key the OMDb ratings
// lookup (src/lib/omdb.ts), since OMDb has no TMDB-id lookup mode of its
// own. Returns null (not thrown) on any failure so a ratings-fetch
// failure never blocks the rest of the detail page. Same caching
// reasoning as fetchMovieDetails -- an IMDb id never changes once set, so
// this could in principle cache forever, but shares the same 24h window
// as the rest of the detail page rather than introducing a second policy.
export const fetchMovieImdbId = unstable_cache(
  async (tmdbId: number): Promise<string | null> => {
    const apiKey = requireApiKey();
    try {
      const res = await tmdbFetch(
        `/movie/${tmdbId}/external_ids`,
        new URLSearchParams({ api_key: apiKey }),
      );
      if (!res.ok) return null;
      const data: { imdb_id: string | null } = await res.json();
      return data.imdb_id || null;
    } catch {
      return null;
    }
  },
  ['tmdb-movie-imdb-id'],
  { revalidate: DETAIL_CACHE_REVALIDATE_SECONDS },
);

export interface TmdbReview {
  id: string;
  author: string;
  content: string;
  url: string;
  created_at: string;
  authorRating: number | null;
  hasSpoilers: boolean;
}

interface TmdbReviewsResponse {
  results: Array<{
    id: string;
    author: string;
    content: string;
    url: string;
    created_at: string;
    author_details: { rating: number | null };
  }>;
}

// Fetches user-submitted reviews for the detail page's Reviews tab.
// TMDB's own reviews, not scraped from anywhere -- same ToS-compliant
// source as every other call in this file. No "most helpful"/like-count
// signal exists in this endpoint (confirmed against TMDB's docs), so
// callers sort by author_details.rating (when a reviewer left one) as
// the closest available proxy rather than the API's fixed return order.
// Same caching reasoning as fetchMovieDetails -- new reviews trickle in
// slowly enough that a 24h window is imperceptible to a real reader.
export const fetchMovieReviews = unstable_cache(
  async (tmdbId: number): Promise<TmdbReview[]> => {
    const apiKey = requireApiKey();
    const res = await tmdbFetch(
      `/movie/${tmdbId}/reviews`,
      new URLSearchParams({ api_key: apiKey, language: 'en-US' }),
    );
    if (!res.ok) {
      throw new Error(`TMDB reviews request failed: ${res.status}`);
    }
    const data: TmdbReviewsResponse = await res.json();
    return data.results.map((r) => ({
      id: r.id,
      author: r.author,
      content: r.content,
      url: r.url,
      created_at: r.created_at,
      authorRating: r.author_details.rating,
      hasSpoilers: containsSpoilers(r.content),
    }));
  },
  ['tmdb-movie-reviews'],
  { revalidate: DETAIL_CACHE_REVALIDATE_SECONDS },
);

// Looks up a single person's IMDb ID by their TMDB person ID, so the
// detail page can link directly to e.g. imdb.com/name/nm0000138 instead
// of an IMDb name search. TMDB's basic /movie/{id}/credits response
// (fetchCredits above) only returns a TMDB person id per cast/crew
// member, not their IMDb id -- this is the one extra per-person call
// needed to get it. Returns null (not thrown) on any failure so one
// missing/unmatched person doesn't break the rest of the cast's links.
// The real payoff of caching this one specifically: a detail page view
// fires up to 13 of these (one per cast/crew member) in parallel, every
// single time, for a value that never changes once TMDB has it -- caching
// turns that into a one-time cost per person across every viewer.
export const fetchPersonImdbId = unstable_cache(
  async (personId: number): Promise<string | null> => {
    const apiKey = requireApiKey();
    try {
      const res = await tmdbFetch(
        `/person/${personId}`,
        new URLSearchParams({ api_key: apiKey }),
      );
      if (!res.ok) return null;
      const data: { imdb_id: string | null } = await res.json();
      return data.imdb_id || null;
    } catch {
      return null;
    }
  },
  ['tmdb-person-imdb-id'],
  { revalidate: DETAIL_CACHE_REVALIDATE_SECONDS },
);
