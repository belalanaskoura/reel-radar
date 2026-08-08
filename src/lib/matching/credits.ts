import { fetchWorkDetails, searchElCinema, sleep as elcinemaSleep, REQUEST_DELAY_MS as ELCINEMA_DELAY_MS } from '../elcinema/fetcher';
import { fetchCastAndCrew, sleep as sceneSleep, REQUEST_DELAY_MS as SCENE_DELAY_MS } from '../scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '../scene/types';
import { normalizeTitle } from './normalize';

export interface CreditsCastMember {
  name: string;
  character: string | null;
  photoUrl: string | null;
  // Only set for TMDB-sourced cast (used to look up a real IMDb profile
  // link); elCinema/Scene fallback credits have no TMDB person id at all.
  tmdbPersonId?: number;
  // Resolved separately (see movies/[id]/page.tsx) from tmdbPersonId via
  // one extra TMDB /person/{id} call each; null until/unless resolved.
  imdbId?: string | null;
}

export interface CreditsInfo {
  source: 'elcinema' | 'scene';
  director: string | null;
  cast: CreditsCastMember[];
}

// Cast/crew fallback for movies TMDB has no credits for; tried in the
// same priority order as the release-date/poster fallback (elCinema
// before Scene), since elCinema at least distinguishes cast from crew
// and links each name to a person page, while Scene gives only a flat
// comma-separated name list with no character names or photos at all.
// Fetched live on detail-page view, not cached in the DB, same
// "fetch live, don't store" reasoning as fetchMovieDetails/fetchCredits
// in movies/[id]/page.tsx (detail pages are viewed far less often than
// the browse grid, not worth bloating every movies row for).
export async function getFallbackCredits(
  title: string,
  branchSlugs: { branch_id: string; slug: string }[],
): Promise<CreditsInfo | null> {
  const elcinema = await getElCinemaCredits(title);
  if (elcinema && (elcinema.director || elcinema.cast.length > 0)) return elcinema;

  const scene = await getSceneCredits(branchSlugs);
  if (scene && (scene.director || scene.cast.length > 0)) return scene;

  return null;
}

async function getElCinemaCredits(title: string): Promise<CreditsInfo | null> {
  try {
    const query = normalizeTitle(title);
    const results = await searchElCinema(query);
    await elcinemaSleep(ELCINEMA_DELAY_MS);

    // Same exact-title-match guard as egypt-release-date.ts: elCinema's
    // search ranking isn't reliably exact-match-first, so an unrelated
    // top result would otherwise silently attach the wrong movie's cast.
    const exactMatch = results.find((r) => normalizeTitle(r.title) === query);
    if (!exactMatch) return null;

    const details = await fetchWorkDetails(exactMatch.elcinemaId);
    await elcinemaSleep(ELCINEMA_DELAY_MS);

    if (!details.credits.director && details.credits.cast.length === 0) return null;

    return {
      source: 'elcinema',
      director: details.credits.director,
      cast: details.credits.cast.map((name) => ({ name, character: null, photoUrl: null })),
    };
  } catch {
    return null;
  }
}

async function getSceneCredits(
  branchSlugs: { branch_id: string; slug: string }[],
): Promise<CreditsInfo | null> {
  // cfc first, matching the branch priority already used for the Scene
  // poster backfill (scripts/backfill-movie-posters-scene.ts).
  const ordered = [...branchSlugs].sort((a, b) =>
    a.branch_id === 'cfc' ? -1 : b.branch_id === 'cfc' ? 1 : 0,
  );

  for (const { branch_id, slug } of ordered) {
    const baseUrl = BRANCH_BASE_URLS[branch_id as BranchId];
    if (!baseUrl) continue;

    try {
      const url = `${baseUrl}/movie-details/${slug}.html`;
      const result = await fetchCastAndCrew(url);
      await sceneSleep(SCENE_DELAY_MS);

      if (result.director || result.cast.length > 0) {
        return {
          source: 'scene',
          director: result.director,
          cast: result.cast.map((name) => ({ name, character: null, photoUrl: null })),
        };
      }
    } catch {
      // Try the next branch rather than failing the whole lookup.
    }
  }

  return null;
}
