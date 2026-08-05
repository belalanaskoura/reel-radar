const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export function posterUrl(posterPath: string | null, size: 'w200' | 'w342' | 'w500' = 'w342'): string | null {
  if (!posterPath) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`;
}
