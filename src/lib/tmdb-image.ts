const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export function posterUrl(posterPath: string | null, size: 'w200' | 'w342' | 'w500' = 'w342'): string | null {
  if (!posterPath) return null;
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
