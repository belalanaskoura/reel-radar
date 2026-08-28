import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTitle } from './normalize';
import { titleSimilarity } from './title-similarity';
import { searchMovies, getEgTheatricalReleaseDate, getMovieById, findByImdbId, type TmdbMovie } from '../tmdb';
import { getEgyptReleaseInfo } from './egypt-release-date';
import { searchElCinema, fetchWorkDetails, sleep, REQUEST_DELAY_MS } from '../elcinema/fetcher';
import { chainForBranch } from '../branches';
import { mapWithConcurrency } from '../concurrency';
import { logError } from '@/lib/logger';

const FUZZY_MATCH_THRESHOLD = 0.8;

export type MatchOutcome = 'matched' | 'ambiguous' | 'unmatched';

interface MatchResult {
  sceneMovieId: string;
  outcome: MatchOutcome | 'error';
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
    const viaImdb = await findTmdbMatchViaImdb(query);
    if (viaImdb) return { outcome: 'matched', movie: viaImdb };
    return { outcome: 'unmatched' };
  }
  if (candidates.length === 1) {
    return { outcome: 'matched', movie: candidates[0] };
  }

  return disambiguate(candidates, query);
}

// Both of TMDB's own search modes (English, Arabic) can come back empty
// for an Egyptian film -- TMDB's catalog coverage for local releases is
// genuinely thinner than a title-search retry can fix. elCinema is the
// stronger source for exactly this case (its whole reason for being in
// this codebase is Egypt release coverage) and its work pages expose a
// real IMDb id per movie -- IMDb itself has near-total coverage of
// Egyptian cinema releases, so cross-referencing through it resolves
// titles TMDB's own search simply doesn't have indexed under any
// spelling. This is an exact id-to-id lookup once the IMDb id is in
// hand (findByImdbId), not a fuzzy guess -- the only fuzziness is
// picking which elCinema search result is the right movie.
//
// Uses titleSimilarity (fuzzy, transliteration-tolerant), not a plain
// normalizeTitle equality check: elCinema and Scene independently
// transliterate the same Arabic title into different English spellings
// (confirmed for real on the very titles this fallback targets --
// elCinema's own search returns "Khally Balak Min Nafsak" for a query of
// "Khali Balak Min Nafsik", "Shamshon w Dalilah" for "Shamshon w
// Delilah" -- an exact-string check rejects every one of these). Same
// 0.8 threshold and best-candidate-wins selection as
// mergeSceneDuplicates' fuzzy pass, since this is solving the identical
// problem: find the one elCinema search result that's actually the same
// movie under transliteration drift, without also matching a genuinely
// different title elCinema's search returned alongside it.
async function findTmdbMatchViaImdb(query: string): Promise<TmdbMovie | null> {
  try {
    const results = await searchElCinema(query);
    await sleep(REQUEST_DELAY_MS);

    let best: { elcinemaId: number; score: number } | null = null;
    for (const r of results) {
      const score = titleSimilarity(query, normalizeTitle(r.title));
      if (score >= FUZZY_MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { elcinemaId: r.elcinemaId, score };
      }
    }
    if (!best) return null;

    const details = await fetchWorkDetails(best.elcinemaId);
    await sleep(REQUEST_DELAY_MS);
    if (!details.imdbId) return null;

    return await findByImdbId(details.imdbId);
  } catch {
    // elCinema/TMDB unreachable or unexpected markup for this one
    // fallback attempt -- fall through to unmatched rather than failing
    // the whole match run over a secondary lookup.
    return null;
  }
}

// VOX's movie_branch_slugs.slug IS the elCinema work id (see
// scrape-vox/route.ts). egypt_releases already maps elcinema_id -> tmdb_id
// via the historical backfill or getEgyptReleaseInfo's live fallback --
// an id-to-id lookup elCinema itself has already vetted, not a fuzzy title
// guess. Checking this first avoids a real failure mode of text search:
// elCinema's English-transliterated Arabic title for a VOX listing (e.g.
// "El Gawahergy") and TMDB's own English title for the same film (e.g.
// "The Jeweler") share no words, so a plain search can match a completely
// different TMDB entry -- confirmed for real, producing two separate
// `movies` rows (one from Scene/TMDB search, one from VOX) for what is
// the same physical movie.
async function findTmdbMatchViaElcinemaId(
  supabase: SupabaseClient,
  movieId: string,
): Promise<TmdbMovie | null> {
  const { data: slugRows } = await supabase
    .from('movie_branch_slugs')
    .select('branch_id, slug')
    .eq('movie_id', movieId);

  const voxSlug = (slugRows ?? []).find((r) => chainForBranch(r.branch_id) === 'vox');
  if (!voxSlug) return null;

  const elcinemaId = Number(voxSlug.slug);
  if (!Number.isFinite(elcinemaId)) return null;

  const { data: release } = await supabase
    .from('egypt_releases')
    .select('tmdb_id')
    .eq('elcinema_id', elcinemaId)
    .maybeSingle();

  if (!release?.tmdb_id) return null;
  return getMovieById(release.tmdb_id);
}

async function disambiguate(candidates: TmdbMovie[], query: string): Promise<TmdbMatch> {
  const withEgDates: { movie: TmdbMovie; egDate: string }[] = [];
  for (const movie of candidates) {
    // A single candidate's release_dates lookup failing (404 for a stale/
    // removed id, a transient TMDB error) shouldn't abort matching every
    // other movie in the batch -- confirmed for real: one bad candidate
    // among "Above & Below"'s ~20 noisy search results threw here and
    // silently starved every movie queued after it in the same run,
    // including one ("Pinocchio: Unstrung") that had an unambiguous
    // single-result match and no reason to ever fail. Treat a failed
    // lookup the same as "no EG date for this candidate" and keep going.
    let egDate: string | null;
    try {
      egDate = await getEgTheatricalReleaseDate(movie.id);
    } catch {
      egDate = null;
    }
    if (egDate) withEgDates.push({ movie, egDate });
  }

  if (withEgDates.length === 1) {
    return { outcome: 'matched', movie: withEgDates[0].movie };
  }

  // Zero candidates with an EG date doesn't necessarily mean genuinely
  // ambiguous -- it can just mean TMDB hasn't tagged Egypt distribution
  // for this movie yet (confirmed for real: "Above & Below", a real 2026
  // release, has zero EG release_dates entries at all, same as every
  // other candidate TMDB's loose title search returned alongside it).
  // Fall back to an exact normalized-title match: only trusted when
  // exactly one candidate's own title is an exact match to the search
  // query, never on a looser signal -- a candidate that merely contains
  // or resembles the query is exactly the kind of noise TMDB's search
  // returns by the dozen (confirmed: this query alone returned ~20
  // candidates, only one an exact title match). Two candidates sharing an
  // exact normalized title is a real, separate risk (a genuine title
  // collision, per Phase 0's "The Odyssey" finding) and correctly falls
  // through to ambiguous rather than guessing between them.
  if (withEgDates.length === 0) {
    const exactTitleMatches = candidates.filter((c) => normalizeTitle(c.title) === query);
    if (exactTitleMatches.length === 1) {
      return { outcome: 'matched', movie: exactTitleMatches[0] };
    }
  }

  // Zero (with no exact-title fallback available) or 2+ candidates with
  // an EG release date is genuinely ambiguous: per Phase 5 sign-off,
  // popularity alone isn't a strong enough signal to auto-pick here.
  return { outcome: 'ambiguous' };
}

// Bounded concurrency for the per-movie loop below -- fully sequential
// used to mean this route had no timeout safety net at all, unlike
// scrape-scene (which already hit cron-job.org's 30s job timeout once for
// an unrelated reason and had to add batching). Each movie's match is
// mostly self-contained (own TMDB/elCinema calls, own row update); same
// cap sync-movies already uses for its own elCinema-calling loop.
//
// One real shared-state case: if two different Scene placeholder rows
// both resolve to the same tmdb_id in the same run (possible if
// mergeSceneDuplicates missed them -- see CLAUDE.md's duplicate-row
// cleanup history), applyTmdbMatch's own check-then-act "does a row for
// this tmdb_id already exist" read can race under concurrency in a way it
// never could sequentially. This is safe, not silently wrong: movies.
// tmdb_id has a real unique constraint, so the loser's update fails with
// 23505 instead of creating a duplicate row, and that failure is caught
// by this function's own per-movie try/catch below (logged as 'error',
// naturally retried next run once the winner's merge has landed) rather
// than corrupting data or crashing the batch.
const MATCH_CONCURRENCY = 10;

// Movies processed (matched, 1-3 external calls each) per call. Unlike
// scrape-scene, MATCH_CONCURRENCY already bounds parallel slots -- but
// concurrency caps how many requests run at once, not the total wall-clock
// time for the whole backlog, so an unmatched backlog large enough (e.g.
// right after adding a new branch/chain, when many movies land unmatched
// at once) can still exceed cron-job.org's 30s job timeout even at
// concurrency=10. Same BATCH_SIZE/?offset= shape scrape-scene already uses
// for the identical reason, sized generously since each batch's real cost
// is bounded by MATCH_CONCURRENCY, not batch size directly.
const BATCH_SIZE = 30;

// Matches one BATCH_SIZE-sized slice (?offset=, defaults to 0) of the
// unmatched Scene-sourced movie backlog (tmdb_id null) against TMDB. Must
// run after mergeSceneDuplicates() so each real movie is looked up once.
// When a match lands on a tmdb_id that's already a real Phase 2 movies
// row, the Scene row's slugs/cache get moved onto that existing row and
// the Scene placeholder is deleted; otherwise the same movie would exist
// as two rows (one TMDB-sourced, one Scene-sourced) indefinitely. Ordered
// by id so repeated offset calls see a stable slice regardless of rows
// resolving (and leaving the unmatched set) between calls.
export async function matchScenesToTmdb(
  supabase: SupabaseClient,
  offset = 0,
): Promise<MatchResult[]> {
  const { data: sceneMovies, error } = await supabase
    .from('movies')
    .select('id, title')
    .is('tmdb_id', null)
    .order('id', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) throw new Error(`Failed to load Scene movies: ${error.message}`);
  if (!sceneMovies) return [];

  return mapWithConcurrency(sceneMovies, MATCH_CONCURRENCY, async (movie): Promise<MatchResult> => {
    try {
      const viaElcinemaId = await findTmdbMatchViaElcinemaId(supabase, movie.id);
      const match: TmdbMatch = viaElcinemaId
        ? { outcome: 'matched', movie: viaElcinemaId }
        : await findTmdbMatch(movie.title);

      if (match.outcome !== 'matched' || !match.movie) {
        await supabase
          .from('movies')
          .update({ match_status: match.outcome })
          .eq('id', movie.id);
        return { sceneMovieId: movie.id, outcome: match.outcome };
      }

      await applyTmdbMatch(supabase, movie.id, match.movie);
      return { sceneMovieId: movie.id, outcome: 'matched', tmdbId: match.movie.id };
    } catch (err) {
      // One movie's failure (a flaky TMDB/elCinema request, an unexpected
      // response shape) shouldn't starve every other movie in the same
      // run -- confirmed for real: a single candidate's release_dates 404
      // during "Above & Below"'s disambiguation aborted the whole batch,
      // leaving "Pinocchio: Unstrung" (queued right after it, with an
      // unambiguous single-result match of its own) permanently unmatched
      // despite having no problem of its own. Leave match_status
      // untouched on error, not 'unmatched'/'ambiguous' -- those are
      // resolved outcomes, this is a transient failure the next run
      // should just retry from scratch.
      logError('match-movies', err, { movieId: movie.id, title: movie.title });
      return { sceneMovieId: movie.id, outcome: 'error' };
    }
  });
}

// Applies a resolved TMDB match to a Scene/VOX row: adopts it as the
// canonical row if no other `movies` row already has this tmdb_id, or
// merges its slugs/cache into the existing tmdb_id row otherwise. Shared
// between the automated matchScenesToTmdb loop above and the admin
// dashboard's manual "resolve this ambiguous movie" action -- both need
// the exact same adopt-vs-merge decision, not two independent
// implementations that could silently drift apart.
export async function applyTmdbMatch(
  supabase: SupabaseClient,
  movieId: string,
  tmdbMovie: TmdbMovie,
): Promise<void> {
  const { data: existingTmdbRow } = await supabase
    .from('movies')
    .select('id')
    .eq('tmdb_id', tmdbMovie.id)
    .maybeSingle();

  if (existingTmdbRow && existingTmdbRow.id !== movieId) {
    await mergeIntoExistingRow(supabase, movieId, existingTmdbRow.id);
    return;
  }

  // No existing TMDB-sourced row for this tmdb_id, so this Scene row is
  // becoming the canonical one: backfill the same fields Phase 2's sync
  // would have set, replacing Scene's format-suffixed title (e.g.
  // "Spider-Man: Brand New Day (2D)") with TMDB's clean one. elCinema is
  // preferred over TMDB's release_date, and used as a poster fallback
  // when TMDB has none (see egypt-release-date.ts).
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
      // Distinct from created_at (when the placeholder was first
      // scraped, which can be long before it's actually matched) --
      // lets the admin digest scope its "matched but no synopsis" check
      // to movies matched since the last run instead of re-checking the
      // whole catalog's TMDB overview on every run forever.
      matched_at: new Date().toISOString(),
    })
    .eq('id', movieId);
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
