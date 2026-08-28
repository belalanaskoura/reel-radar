import { unstable_cache } from 'next/cache';
import { fetchWorkDetails, searchElCinema, sleep as elcinemaSleep, REQUEST_DELAY_MS as ELCINEMA_DELAY_MS } from '../elcinema/fetcher';
import { fetchCastAndCrew, sleep as sceneSleep, REQUEST_DELAY_MS as SCENE_DELAY_MS } from '../scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '../scene/types';
import { normalizeTitle } from './normalize';

// This fallback is only reached when TMDB has no credits at all -- but
// when it is, it chains up to 5 sequential live scrapes (elCinema search,
// elCinema work details, then up to 3 Scene branches), each with its own
// 15s timeout and a sleep in between, all blocking the detail page's
// server render. Worst case that's well over a minute, repeated on every
// single view of that movie's page since nothing was cached. Wrapped the
// same way every TMDB call in src/lib/tmdb.ts already is: real cast/crew
// data changes on the order of never, once a movie is out, so a slow
// scrape only needs to happen once per movie across every viewer.
const FALLBACK_CREDITS_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24;

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
// Not stored in the DB (same "fetch, don't persist" reasoning as
// fetchMovieDetails/fetchCredits in movies/[id]/page.tsx) but cached
// in-memory across requests -- see the module comment above.
export const getFallbackCredits = unstable_cache(
  async (
    title: string,
    branchSlugs: { branch_id: string; slug: string }[],
  ): Promise<CreditsInfo | null> => {
    const elcinema = await getElCinemaCredits(title);
    if (elcinema && (elcinema.director || elcinema.cast.length > 0)) return elcinema;

    const scene = await getSceneCredits(branchSlugs);
    if (scene && (scene.director || scene.cast.length > 0)) return scene;

    return null;
  },
  ['fallback-credits'],
  { revalidate: FALLBACK_CREDITS_CACHE_REVALIDATE_SECONDS },
);

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
