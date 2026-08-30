import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchWorkDetails, searchElCinema, sleep, REQUEST_DELAY_MS } from '../elcinema/fetcher';
import { normalizeTitle } from './normalize';
import { getUsTheatricalReleaseDate } from '../tmdb';

export interface EgyptReleaseInfo {
  releaseDate: string | null;
  posterUrl: string | null;
}

export interface DisplayReleaseDate {
  releaseDate: string | null;
  // false whenever `releaseDate` is a fallback (TMDB's US date, or its
  // ambiguous top-level release_date as a last resort) rather than a real
  // Egypt-confirmed one -- callers use this to label the date in the UI
  // instead of presenting a guess as fact.
  isEgyptConfirmed: boolean;
}

// Resolves the date to actually display for a movie: elCinema's Egypt date
// (already-fetched via getEgyptReleaseInfo, passed in rather than
// re-fetched since callers already need that same call for the poster
// fallback too) when known, else TMDB's real US theatrical date, else
// TMDB's own ambiguous top-level release_date as a last resort (confirmed
// for real: TMDB's top-level field is not reliably any one country --
// "Primetime" resolved to Canada's date there while TMDB's own website
// prominently shows the US date instead). `tmdbFallbackDate` is the
// caller's already-fetched TmdbMovie.release_date.
export async function resolveDisplayReleaseDate(
  egyptInfo: EgyptReleaseInfo,
  tmdbId: number,
  tmdbFallbackDate: string | null,
): Promise<DisplayReleaseDate> {
  if (egyptInfo.releaseDate) {
    return { releaseDate: egyptInfo.releaseDate, isEgyptConfirmed: true };
  }

  try {
    const usDate = await getUsTheatricalReleaseDate(tmdbId);
    if (usDate) return { releaseDate: usDate, isEgyptConfirmed: false };
  } catch {
    // fall through to the ambiguous top-level date below
  }

  return { releaseDate: tmdbFallbackDate, isEgyptConfirmed: false };
}

// elCinema is the source of truth for a matched movie's Egypt release
// date: TMDB's `release_date` is a single global value that can land on
// an unrelated country's date when TMDB has no EG release_dates entry at
// all (confirmed for real: "El Gawahergy" showed TMDB's Germany date,
// months off from elCinema's actual Egypt date). It's also used as a
// poster fallback for movies TMDB has no poster for. TMDB stays the
// fallback for movies elCinema has no record of, for both fields.
//
// Checks the `egypt_releases` table (populated by the historical
// backfill) first; if the movie isn't there yet (e.g. a brand-new
// release the 4-years-back backfill predates), falls back to a live
// elCinema title search + work-page fetch, and caches the result into
// `egypt_releases` so the next lookup for this movie is free. Date and
// poster are fetched together (one work-page request) rather than as two
// separate lookups, since every current caller wants both.
export async function getEgyptReleaseInfo(
  supabase: SupabaseClient,
  tmdbId: number,
  title: string,
): Promise<EgyptReleaseInfo> {
  const { data: existing } = await supabase
    .from('egypt_releases')
    .select('elcinema_id, release_date, release_year, poster_url')
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (existing) {
    // A cached row with a null poster_url or null release_date means
    // "never (successfully) found one," not "confirmed absent forever" --
    // elCinema's own release-dates table genuinely fills in over time as a
    // distributor confirms a country's date (confirmed for real: "Primetime"
    // had zero country entries at match time, Canada's date appeared later).
    // Re-check both together with one cheap targeted re-fetch of the
    // already-known work page (no search needed) rather than trusting a
    // stale null forever. Bounded to release_year >= last year so this
    // doesn't keep re-fetching an old title that will never get a date.
    const releaseDateStillPending =
      existing.release_date === null &&
      (existing.release_year === null || existing.release_year >= new Date().getFullYear() - 1);
    if ((existing.poster_url === null || releaseDateStillPending) && existing.elcinema_id) {
      try {
        const details = await fetchWorkDetails(existing.elcinema_id);
        await sleep(REQUEST_DELAY_MS);
        const update: Record<string, string> = {};
        if (details.posterUrl) update.poster_url = details.posterUrl;
        if (details.releaseDate) update.release_date = details.releaseDate;
        if (Object.keys(update).length > 0) {
          await supabase.from('egypt_releases').update(update).eq('elcinema_id', existing.elcinema_id);
        }
        return {
          releaseDate: details.releaseDate ?? existing.release_date ?? null,
          posterUrl: details.posterUrl ?? existing.poster_url ?? null,
        };
      } catch {
        return { releaseDate: existing.release_date ?? null, posterUrl: existing.poster_url ?? null };
      }
    }

    return { releaseDate: existing.release_date ?? null, posterUrl: existing.poster_url ?? null };
  }

  try {
    const query = normalizeTitle(title);
    const results = await searchElCinema(query);
    await sleep(REQUEST_DELAY_MS);

    // elCinema's search ranking is not reliably exact-match-first --
    // confirmed for real: searching "runner" ranked "Runner Runner" above
    // the exact title "Runner", and a title with zero real elCinema
    // listing ("First Witch") still returned 25 unrelated "Witch" results.
    // Only trust a hit whose own title normalizes to the same query;
    // otherwise this is a movie elCinema has no record of, not a match.
    const exactMatch = results.find((r) => normalizeTitle(r.title) === query);
    if (!exactMatch) return { releaseDate: null, posterUrl: null };

    const details = await fetchWorkDetails(exactMatch.elcinemaId);
    await sleep(REQUEST_DELAY_MS);

    await supabase.from('egypt_releases').upsert(
      {
        elcinema_id: details.elcinemaId,
        imdb_id: details.imdbId,
        tmdb_id: tmdbId,
        title: details.title,
        release_year: details.releaseYear,
        release_date: details.releaseDate,
        poster_url: details.posterUrl,
        match_status: 'matched',
      },
      { onConflict: 'elcinema_id' },
    );

    return { releaseDate: details.releaseDate, posterUrl: details.posterUrl };
  } catch {
    // elCinema unreachable/unexpected markup, fall back to TMDB's data
    // rather than failing the whole sync/match run over a display detail.
    return { releaseDate: null, posterUrl: null };
  }
}
