import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTitle } from './normalize';
import { titleSimilarity } from './title-similarity';

const FUZZY_MERGE_THRESHOLD = 0.8;

// Same DUB/format-suffix vocabulary as normalizeTitle, but matched against
// a Scene slug (hyphen-separated) rather than a title.
const FORMAT_VARIANT_SLUG_PATTERN = /-(2d|3d|4dx|imax|vip|dub|dubbing|arabic|english)(-|$)/i;
function isFormatVariantSlug(slug: string): boolean {
  return FORMAT_VARIANT_SLUG_PATTERN.test(slug);
}

type Placeholder = { id: string; title: string; created_at: string };

// Phase 4's scraper creates one placeholder `movies` row per (branch,
// slug) pair, so the same real movie can end up as several rows if it's
// listed on both branches (e.g. "The Odyssey" on cfc and district5).
// This groups unmatched placeholder rows by normalized title, keeps the
// oldest row per group as canonical, and repoints every other row's
// `movie_branch_slugs`/`showtimes_cache` onto it before deleting the
// redundant rows. Must run before TMDB matching so each real movie is
// matched once, not once per branch it happens to be listed on.
//
// A second pass then groups whatever's left by fuzzy title similarity
// (see title-similarity.ts): Scene and VOX each transliterate Arabic
// titles independently, so the same movie can show up as e.g. "Khali
// Balak Min Nafsik" (Scene) and "Khally Balak Min Nafsak" (VOX) --
// different enough that normalizeTitle's exact-match grouping above never
// catches them, but close enough that a title text search can't reliably
// resolve either spelling to the right TMDB entry, leaving both stuck
// unmatched (no poster/synopsis/cast) indefinitely. Exact-match runs
// first and separately because it's a stronger, cheaper signal (O(n) via
// a hash key vs O(n^2) pairwise comparison) -- no reason to pay the fuzzy
// pass's cost for pairs the cheap pass already resolves.
//
// A third pass reconciles whatever's still left against movies that
// already have a tmdb_id (matched via TMDB search, or synced straight
// from TMDB by sync-movies). The two passes above only ever compare
// placeholders against each other, never against an already-`tmdb_id`-
// having row -- so a placeholder created after its real movie was already
// matched (a re-scrape, a second branch/chain listing it for the first
// time) sits permanently unmerged next to the row it duplicates.
// Confirmed for real: "The End of Oak Street" existed as a matched-via-
// TMDB row plus two separate unmatched Scene/VOX placeholders, none of
// which the two passes above could ever bring together, since none of
// them shares the `tmdb_id IS NULL` scope those passes require.
export async function mergeSceneDuplicates(
  supabase: SupabaseClient,
): Promise<{ groupsMerged: number; rowsDeleted: number }> {
  const { data: placeholders, error } = await supabase
    .from('movies')
    .select('id, title, created_at')
    .is('tmdb_id', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load placeholder movies: ${error.message}`);
  if (!placeholders || placeholders.length === 0) {
    return { groupsMerged: 0, rowsDeleted: 0 };
  }

  const exactGroups = new Map<string, Placeholder[]>();
  for (const movie of placeholders) {
    const key = normalizeTitle(movie.title);
    const group = exactGroups.get(key) ?? [];
    group.push(movie);
    exactGroups.set(key, group);
  }

  let groupsMerged = 0;
  let rowsDeleted = 0;
  const survivors: Placeholder[] = [];

  for (const group of exactGroups.values()) {
    if (group.length < 2) {
      survivors.push(...group);
      continue;
    }
    await mergeGroup(supabase, group);
    groupsMerged += 1;
    rowsDeleted += group.length - 1;
    survivors.push(group[0]);
  }

  const fuzzyGroups = groupByFuzzyTitle(survivors);
  const fuzzyGroupedIds = new Set<string>();
  for (const group of fuzzyGroups) {
    await mergeGroup(supabase, group);
    groupsMerged += 1;
    rowsDeleted += group.length - 1;
    for (const movie of group) fuzzyGroupedIds.add(movie.id);
  }

  const stillUnmatched = survivors.filter((m) => !fuzzyGroupedIds.has(m.id));
  const reconciled = await reconcileAgainstMatchedMovies(supabase, stillUnmatched);
  rowsDeleted += reconciled;

  return { groupsMerged, rowsDeleted };
}

// Compares each remaining placeholder's title against every movie that
// already has a tmdb_id, exact match first then fuzzy, and folds the
// placeholder into that row if found -- the same merge machinery
// mergeGroup already uses, just with the "canonical" row picked by
// tmdb_id presence rather than earliest created_at.
async function reconcileAgainstMatchedMovies(
  supabase: SupabaseClient,
  placeholders: Placeholder[],
): Promise<number> {
  if (placeholders.length === 0) return 0;

  const { data: matchedMovies, error } = await supabase
    .from('movies')
    .select('id, title, created_at')
    .not('tmdb_id', 'is', null);

  if (error) throw new Error(`Failed to load matched movies: ${error.message}`);
  if (!matchedMovies || matchedMovies.length === 0) return 0;

  const matchedByKey = new Map<string, Placeholder>();
  for (const movie of matchedMovies) {
    matchedByKey.set(normalizeTitle(movie.title), movie);
  }

  let rowsDeleted = 0;

  for (const placeholder of placeholders) {
    const key = normalizeTitle(placeholder.title);
    let target = matchedByKey.get(key);

    if (!target) {
      for (const movie of matchedMovies) {
        if (titleSimilarity(key, normalizeTitle(movie.title)) >= FUZZY_MERGE_THRESHOLD) {
          target = movie;
          break;
        }
      }
    }

    if (!target) continue;

    // mergeGroup deletes every row after the first, so pass [target,
    // placeholder] to keep the matched row and drop the placeholder.
    await mergeGroup(supabase, [target, placeholder]);
    rowsDeleted += 1;
  }

  return rowsDeleted;
}

// Greedy clustering: each not-yet-grouped movie starts a new cluster and
// pulls in every other not-yet-grouped movie whose normalized title
// scores >= FUZZY_MERGE_THRESHOLD against it. Order doesn't matter here
// the way it might for a general clustering problem -- at this dataset's
// scale (a handful of leftover unmatched placeholders per run, not
// hundreds) a transitivity edge case would be a rare coincidence, not a
// real risk worth a more careful algorithm for.
function groupByFuzzyTitle(movies: Placeholder[]): Placeholder[][] {
  const remaining = movies.map((m) => ({ movie: m, key: normalizeTitle(m.title) }));
  const clusters: Placeholder[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const cluster = [seed.movie];

    for (let i = remaining.length - 1; i >= 0; i--) {
      if (titleSimilarity(seed.key, remaining[i].key) >= FUZZY_MERGE_THRESHOLD) {
        cluster.push(remaining[i].movie);
        remaining.splice(i, 1);
      }
    }

    if (cluster.length > 1) clusters.push(cluster);
  }

  return clusters;
}

async function mergeGroup(supabase: SupabaseClient, group: Placeholder[]): Promise<void> {
  const [canonical, ...duplicates] = group;
  const duplicateIds = duplicates.map((m) => m.id);

  // Repoint one branch at a time. movie_branch_slugs' primary key is
  // (movie_id, branch_id) -- a movie can only have one slug per branch
  // -- so when a duplicate's slug is on a branch the canonical row
  // already occupies (e.g. cfc's "toy-story-5" vs a duplicate's
  // "toy-story-5-arabic-dubbing", both DUB/format variants of the same
  // movie), the repoint is skipped and that duplicate slug link is
  // deliberately dropped along with the duplicate movie row below,
  // rather than attempted and left to fail. Prefer the duplicate's slug
  // over the canonical's only when the canonical's own slug looks like
  // a DUB/format variant and the duplicate's doesn't, so the surviving
  // slug is the subtitled/plain listing rather than whichever happened
  // to be scraped first.
  //
  // A prior version of this skip check silently swallowed the resulting
  // 23505 (unique violation) from attempting the repoint anyway, which
  // meant the duplicate's slug link was neither repointed nor
  // preserved -- it just vanished when the duplicate movie row was
  // deleted, and the scraper recreated a fresh duplicate on its next
  // run. This version decides up front instead of attempting and
  // silently failing.
  const { data: canonicalSlugRows } = await supabase
    .from('movie_branch_slugs')
    .select('branch_id, slug')
    .eq('movie_id', canonical.id);
  const canonicalSlugByBranch = new Map((canonicalSlugRows ?? []).map((r) => [r.branch_id, r.slug]));

  const { data: duplicateSlugs } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id, branch_id, slug')
    .in('movie_id', duplicateIds);

  for (const row of duplicateSlugs ?? []) {
    const existingSlug = canonicalSlugByBranch.get(row.branch_id);
    if (existingSlug === undefined) {
      await supabase
        .from('movie_branch_slugs')
        .update({ movie_id: canonical.id })
        .eq('movie_id', row.movie_id)
        .eq('branch_id', row.branch_id);
      canonicalSlugByBranch.set(row.branch_id, row.slug);
      continue;
    }

    if (isFormatVariantSlug(existingSlug) && !isFormatVariantSlug(row.slug)) {
      // Swap: drop the canonical's DUB/format-variant slug, keep the
      // duplicate's plain one instead.
      await supabase
        .from('movie_branch_slugs')
        .delete()
        .eq('movie_id', canonical.id)
        .eq('branch_id', row.branch_id);
      await supabase
        .from('movie_branch_slugs')
        .update({ movie_id: canonical.id })
        .eq('movie_id', row.movie_id)
        .eq('branch_id', row.branch_id);
      canonicalSlugByBranch.set(row.branch_id, row.slug);
    }
    // Otherwise the canonical's existing slug for this branch is kept
    // and the duplicate's is dropped when the duplicate row is deleted.
  }

  const { data: canonicalCacheBranches } = await supabase
    .from('showtimes_cache')
    .select('branch_id')
    .eq('movie_id', canonical.id);
  const takenCacheBranches = new Set((canonicalCacheBranches ?? []).map((r) => r.branch_id));

  const { data: duplicateCache } = await supabase
    .from('showtimes_cache')
    .select('movie_id, branch_id')
    .in('movie_id', duplicateIds);

  for (const row of duplicateCache ?? []) {
    if (takenCacheBranches.has(row.branch_id)) continue;
    await supabase
      .from('showtimes_cache')
      .update({ movie_id: canonical.id })
      .eq('movie_id', row.movie_id)
      .eq('branch_id', row.branch_id);
    takenCacheBranches.add(row.branch_id);
  }

  const { error: deleteError } = await supabase.from('movies').delete().in('id', duplicateIds);
  if (deleteError) throw new Error(`Failed to delete duplicate movies: ${deleteError.message}`);
}
