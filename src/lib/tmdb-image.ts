const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// Scene Cinemas poster URLs are unreachable by Vercel's Image Optimization
// service specifically (Cloudflare in front of Scene's static host appears to
// block Vercel's IP range; confirmed working via direct fetch and via a
// local `next start` production build, but consistently rejected in
// production with OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED). Routed
// through our own same-origin proxy (src/app/api/scene-poster/route.ts)
// instead, which sidesteps Vercel's optimizer for this host entirely.
// Matches any scenecinemas.com subdomain (not just today's two branches)
// so a future branch needs no change here.
function isScenePosterHost(hostname: string): boolean {
  return hostname === 'scenecinemas.com' || hostname.endsWith('.scenecinemas.com');
}

// `movies.poster_path` is usually a TMDB-relative path, but can also hold
// a full elCinema or Scene Cinemas poster URL (fallbacks for movies TMDB
// has no poster for; see src/lib/matching/egypt-release-date.ts and
// src/app/api/scrape-scene/route.ts). An absolute URL is passed through
// as-is (rewritten to our proxy for Scene hosts) rather than prefixed with
// TMDB's base.
export function posterUrl(posterPath: string | null, size: 'w200' | 'w342' | 'w500' = 'w342'): string | null {
  if (!posterPath) return null;
  if (posterPath.startsWith('http://') || posterPath.startsWith('https://')) {
    const hostname = new URL(posterPath).hostname;
    if (isScenePosterHost(hostname)) {
      return `/api/scene-poster?src=${encodeURIComponent(posterPath)}`;
    }
    return posterPath;
  }
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
