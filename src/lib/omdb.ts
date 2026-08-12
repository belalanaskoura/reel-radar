const OMDB_BASE_URL = 'https://www.omdbapi.com/';

export interface OmdbRatings {
  imdbId: string;
  imdbRating: string | null;
  imdbVotes: string | null;
  metascore: string | null;
  rottenTomatoes: string | null;
}

interface OmdbResponse {
  Response: 'True' | 'False';
  imdbRating?: string;
  imdbVotes?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

// Ratings only (IMDb + Metacritic + Rotten Tomatoes) via OMDb
// (omdbapi.com), a real, ToS-compliant API, not scraped -- OMDb has no
// review text at all, that comes from TMDB's own /reviews endpoint
// instead (see fetchMovieReviews in src/lib/tmdb.ts). Keyed by IMDb id
// since OMDb has no TMDB-id lookup mode. Returns null (not thrown) on
// any failure -- missing/unconfigured key, no OMDb entry for this title,
// network error -- so a ratings lookup can never block the rest of the
// detail page from rendering.
//
// OMDb never returns a Metacritic or Rotten Tomatoes page URL, only the
// IMDb id passed in (echoed back, not looked up) -- neither site has a
// public id-based lookup, so callers can only link the IMDb card
// directly; the other two are deliberately left non-clickable rather
// than risk linking to the wrong title via a guessed search URL.
export async function fetchOmdbRatings(imdbId: string): Promise<OmdbRatings | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({ apikey: apiKey, i: imdbId });
    const res = await fetch(`${OMDB_BASE_URL}?${params}`);
    if (!res.ok) return null;
    const data: OmdbResponse = await res.json();
    if (data.Response !== 'True') return null;

    const metascoreEntry = data.Ratings?.find((r) => r.Source === 'Metacritic');
    const rtEntry = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');

    return {
      imdbId,
      imdbRating: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
      imdbVotes: data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : null,
      metascore:
        metascoreEntry && metascoreEntry.Value !== 'N/A' ? metascoreEntry.Value.split('/')[0] : null,
      rottenTomatoes: rtEntry && rtEntry.Value !== 'N/A' ? rtEntry.Value : null,
    };
  } catch {
    return null;
  }
}
