// A candidate counts as "recent" if its release is within the last ~2
// years or still upcoming -- wide enough to cover a movie that released
// elsewhere before reaching Egyptian cinemas (RNS/Scene listings lag a
// real theatrical release by months, sometimes over a year), narrow
// enough that it never mistakes an old catalog title (a franchise
// original, a decades-old re-release) for the current listing. Used by
// match-to-tmdb.ts's disambiguate() as a last-resort tiebreaker between
// multiple exact-title TMDB candidates with no EG release_dates entry
// (e.g. "Resident Evil" 2026 vs. the 2002 original, an exact-title
// collision TMDB itself doesn't disambiguate). Kept in its own file
// (rather than alongside disambiguate() in match-to-tmdb.ts) so it can
// be unit-tested without pulling in that file's transitive `@/`-aliased
// imports, which vitest.config.ts has no path-alias resolution for.
const RECENT_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export function isRecentOrUpcoming(releaseDate: string): boolean {
  if (!releaseDate) return false;
  const parsed = new Date(releaseDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= Date.now() - RECENT_WINDOW_MS;
}
