import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTitle } from './normalize';
import { searchMovies, getEgTheatricalReleaseDate, type TmdbMovie } from '../tmdb';
import { getEgyptReleaseInfo } from './egypt-release-date';

export type MatchOutcome = 'matched' | 'ambiguous' | 'unmatched';

interface MatchResult {
  sceneMovieId: string;
  outcome: MatchOutcome;
  tmdbId?: number;
}

export interface TmdbMatch {
  outcome: MatchOutcome;
  movie?: TmdbMovie;
}

// Matches one Scene-sourced movie (no tmdb_id yet) against TMDB, following
// the Phase 0/1 pipeline: English search first, Arabic fallback on zero
// results (Phase 0 found Arabic-titled Egyptian films return nothing in
// English search), then disambiguate multi-result collisions via an EG
// release_dates entry rather than popularity alone (Phase 0 found real
// title collisions, e.g. two different 2026 movies both titled "The
// Odyssey"; popularity alone would guess wrong roughly as often as
// right). Anything still ambiguous is surfaced for manual review, never
// auto-picked.
export async function findTmdbMatch(title: string): Promise<TmdbMatch> {
  const query = normalizeTitle(title);

  let candidates = await searchMovies(query, 'en-US');
  if (candidates.length === 0) {
    candidates = await searchMovies(query, 'ar');
  }

  if (candidates.length === 0) {
    return { outcome: 'unmatched' };
  }
  if (candidates.length === 1) {
    return { outcome: 'matched', movie: candidates[0] };
  }

  return disambiguate(candidates);
}

async function disambiguate(candidates: TmdbMovie[]): Promise<TmdbMatch> {
  const withEgDates: { movie: TmdbMovie; egDate: string }[] = [];
  for (const movie of candidates) {
    const egDate = await getEgTheatricalReleaseDate(movie.id);
    if (egDate) withEgDates.push({ movie, egDate });
  }

  if (withEgDates.length === 1) {
    return { outcome: 'matched', movie: withEgDates[0].movie };
  }

  // Zero or 2+ candidates with an EG release date is genuinely ambiguous:
  // per Phase 5 sign-off, popularity alone isn't a strong enough
  // signal to auto-pick here.
  return { outcome: 'ambiguous' };
}

// Matches every unmatched Scene-sourced movie (tmdb_id null) against TMDB.
// Must run after mergeSceneDuplicates() so each real movie is looked up
// once. When a match lands on a tmdb_id that's already a real Phase 2
// movies row, the Scene row's slugs/cache get moved onto that existing row
// and the Scene placeholder is deleted; otherwise the same movie would
// exist as two rows (one TMDB-sourced, one Scene-sourced) indefinitely.
export async function matchScenesToTmdb(supabase: SupabaseClient): Promise<MatchResult[]> {
  const { data: sceneMovies, error } = await supabase
    .from('movies')
    .select('id, title')
    .is('tmdb_id', null);

  if (error) throw new Error(`Failed to load Scene movies: ${error.message}`);
  if (!sceneMovies) return [];

  const results: MatchResult[] = [];

  for (const movie of sceneMovies) {
    const match = await findTmdbMatch(movie.title);

    if (match.outcome !== 'matched' || !match.movie) {
      await supabase
        .from('movies')
        .update({ match_status: match.outcome })
        .eq('id', movie.id);
      results.push({ sceneMovieId: movie.id, outcome: match.outcome });
      continue;
    }

    const tmdbMovie = match.movie;
    const { data: existingTmdbRow } = await supabase
      .from('movies')
      .select('id')
      .eq('tmdb_id', tmdbMovie.id)
      .maybeSingle();

    if (existingTmdbRow && existingTmdbRow.id !== movie.id) {
      await mergeIntoExistingRow(supabase, movie.id, existingTmdbRow.id);
    } else {
      // No existing TMDB-sourced row for this tmdb_id, so this Scene row
      // is becoming the canonical one: backfill the same fields
      // Phase 2's sync would have set, replacing Scene's format-suffixed
      // title (e.g. "Spider-Man: Brand New Day (2D)") with TMDB's clean one.
      // elCinema is preferred over TMDB's release_date, and used as a
      // poster fallback when TMDB has none (see egypt-release-date.ts).
      const egyptInfo = await getEgyptReleaseInfo(supabase, tmdbMovie.id, tmdbMovie.title);
      await supabase
        .from('movies')
        .update({
          tmdb_id: tmdbMovie.id,
          title: tmdbMovie.title,
          original_title: tmdbMovie.original_title,
          poster_path: tmdbMovie.poster_path || egyptInfo.posterUrl || null,
          release_date: egyptInfo.releaseDate || tmdbMovie.release_date || null,
          popularity: tmdbMovie.popularity,
          match_status: 'matched',
        })
        .eq('id', movie.id);
    }

    results.push({ sceneMovieId: movie.id, outcome: 'matched', tmdbId: tmdbMovie.id });
  }

  return results;
}

async function mergeIntoExistingRow(
  supabase: SupabaseClient,
  sceneMovieId: string,
  targetMovieId: string,
): Promise<void> {
  const { data: targetBranches } = await supabase
    .from('movie_branch_slugs')
    .select('branch_id')
    .eq('movie_id', targetMovieId);
  const taken = new Set((targetBranches ?? []).map((r) => r.branch_id));

  const { data: sceneSlugs } = await supabase
    .from('movie_branch_slugs')
    .select('branch_id')
    .eq('movie_id', sceneMovieId);

  for (const row of sceneSlugs ?? []) {
    if (taken.has(row.branch_id)) continue;
    await supabase
      .from('movie_branch_slugs')
      .update({ movie_id: targetMovieId })
      .eq('movie_id', sceneMovieId)
      .eq('branch_id', row.branch_id);
    taken.add(row.branch_id);
  }

  const { data: targetCacheBranches } = await supabase
    .from('showtimes_cache')
    .select('branch_id')
    .eq('movie_id', targetMovieId);
  const takenCache = new Set((targetCacheBranches ?? []).map((r) => r.branch_id));

  const { data: sceneCache } = await supabase
    .from('showtimes_cache')
    .select('branch_id')
    .eq('movie_id', sceneMovieId);

  for (const row of sceneCache ?? []) {
    if (takenCache.has(row.branch_id)) continue;
    await supabase
      .from('showtimes_cache')
      .update({ movie_id: targetMovieId })
      .eq('movie_id', sceneMovieId)
      .eq('branch_id', row.branch_id);
    takenCache.add(row.branch_id);
  }

  await supabase.from('movies').delete().eq('id', sceneMovieId);
}
