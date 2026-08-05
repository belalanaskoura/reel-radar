const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// `movies.poster_path` is usually a TMDB-relative path, but can also hold
// a full elCinema poster URL (the fallback for movies TMDB has no poster
// for -- see src/lib/matching/egypt-release-date.ts). An absolute URL is
// passed through as-is rather than prefixed with TMDB's base.
export function posterUrl(posterPath: string | null, size: 'w200' | 'w342' | 'w500' = 'w342'): string | null {
  if (!posterPath) return null;
  if (posterPath.startsWith('http://') || posterPath.startsWith('https://')) return posterPath;
  return `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`;
}

export function backdropUrl(backdropPath: string | null, size: 'w780' | 'w1280' = 'w1280'): string | null {
  if (!backdropPath) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${backdropPath}`;
}

export function profileUrl(profilePath: string | null, size: 'w185' = 'w185'): string | null {
  if (!profilePath) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${profilePath}`;
}
