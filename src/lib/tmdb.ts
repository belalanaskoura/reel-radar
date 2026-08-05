const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  release_date: string;
  popularity: number;
}

interface TmdbDiscoverResponse {
  page: number;
  results: TmdbMovie[];
  total_pages: number;
  total_results: number;
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
  } while (page <= totalPages && page <= 5); // cap at 5 pages (100 movies)

  return results;
}
