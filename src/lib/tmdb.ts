const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

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

// Genre ID for "Documentary" in TMDB's fixed genre list -- Egyptian
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
// `region=EG` alone is not a real filter -- it only prefers EG release
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
    // testing -- unlike with_release_type it does NOT support a pipe-
    // separated OR list), so the multi-language exclusion below happens
    // client-side after fetching instead.
  });

  const results: TmdbMovie[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    params.set('page', String(page));
    const res = await fetch(`${TMDB_BASE_URL}/discover/movie?${params}`);
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
// then 'ar' as a fallback -- Phase 0 found some Arabic-titled Egyptian
// films return zero results in English search entirely.
export async function searchMovies(query: string, language: 'en-US' | 'ar'): Promise<TmdbMovie[]> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    language,
    include_adult: 'false',
  });

  const res = await fetch(`${TMDB_BASE_URL}/search/movie?${params}`);
  if (!res.ok) {
    throw new Error(`TMDB search request failed: ${res.status}`);
  }
  const data: TmdbSearchResponse = await res.json();
  return data.results;
}

// Returns the EG THEATRICAL release_date entry for a movie, or null if
// TMDB has no theatrical entry for EG (a digital/TV-only EG entry does not
// count -- confirmed necessary after Moana 2 (a 2024 Disney+ release) had
// an EG entry of type 4/digital and was nearly auto-matched over the real
// 2026 theatrical Moana, which had no EG entry at all). Used to
// disambiguate multi-result searches: Phase 0 found genuine title
// collisions (two different 2026 movies both titled "The Odyssey"), and a
// real EG theatrical date is a stronger signal than popularity alone for
// "this is the one actually playing in Egypt's cinemas."
export async function getEgTheatricalReleaseDate(tmdbId: number): Promise<string | null> {
  const apiKey = requireApiKey();
  const res = await fetch(
    `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates?api_key=${apiKey}`,
  );
  if (!res.ok) {
    throw new Error(`TMDB release_dates request failed: ${res.status}`);
  }
  const data: TmdbReleaseDatesResponse = await res.json();
  const eg = data.results.find((r) => r.iso_3166_1 === 'EG');
  if (!eg) return null;
  // type 2 = limited theatrical, 3 = theatrical. Digital (4), physical (5),
  // TV (6), and premiere (1) entries don't indicate a cinema release.
  const theatrical = eg.release_dates.find((d) => d.type === 2 || d.type === 3);
  return theatrical?.release_date ?? null;
}

// Looks up a movie by IMDb ID -- a much more reliable cross-reference
// than title search when the source (elCinema) exposes one, since it's
// an exact match rather than a fuzzy one. Returns null if TMDB has no
// movie for that IMDb ID.
export async function findByImdbId(imdbId: string): Promise<TmdbMovie | null> {
  const apiKey = requireApiKey();
  const res = await fetch(
    `${TMDB_BASE_URL}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`,
  );
  if (!res.ok) {
    throw new Error(`TMDB find request failed: ${res.status}`);
  }
  const data: TmdbFindResponse = await res.json();
  return data.movie_results[0] ?? null;
}

// Fetches full movie details (overview, tagline, backdrop, runtime,
// genres) for the detail page. Not stored in the DB -- fetched live on
// page view since detail pages are viewed far less often than the browse
// grid, so there's no benefit to bloating every `movies` row with data
// most of them will never need rendered.
export async function fetchMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
  const apiKey = requireApiKey();
  const res = await fetch(
    `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${apiKey}&language=en-US`,
  );
  if (!res.ok) {
    throw new Error(`TMDB movie details request failed: ${res.status}`);
  }
  return res.json();
}

// Fetches cast and crew for the detail page. Same "fetch live, don't
// store" reasoning as fetchMovieDetails.
export async function fetchCredits(tmdbId: number): Promise<TmdbCredits> {
  const apiKey = requireApiKey();
  const res = await fetch(
    `${TMDB_BASE_URL}/movie/${tmdbId}/credits?api_key=${apiKey}&language=en-US`,
  );
  if (!res.ok) {
    throw new Error(`TMDB credits request failed: ${res.status}`);
  }
  return res.json();
}
