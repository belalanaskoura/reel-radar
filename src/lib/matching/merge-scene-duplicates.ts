import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTitle } from './normalize';

// Phase 4's scraper creates one placeholder `movies` row per (branch,
// slug) pair, so the same real movie can end up as several rows if it's
// listed on both branches (e.g. "The Odyssey" on cfc and district5).
// This groups unmatched placeholder rows by normalized title, keeps the
// oldest row per group as canonical, and repoints every other row's
// `movie_branch_slugs`/`showtimes_cache` onto it before deleting the
// redundant rows. Must run before TMDB matching so each real movie is
// matched once, not once per branch it happens to be listed on.
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

  const groups = new Map<string, typeof placeholders>();
  for (const movie of placeholders) {
    const key = normalizeTitle(movie.title);
    const group = groups.get(key) ?? [];
    group.push(movie);
    groups.set(key, group);
  }

  let groupsMerged = 0;
  let rowsDeleted = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const [canonical, ...duplicates] = group;
    const duplicateIds = duplicates.map((m) => m.id);

    // Repoint one branch at a time rather than a blind bulk UPDATE, so a
    // branch the canonical row already has (shouldn't happen today, per
    // Phase 4's one-slug-per-placeholder shape, but not guaranteed forever)
    // is skipped instead of violating the (movie_id, branch_id) primary key.
    const { data: canonicalSlugBranches } = await supabase
      .from('movie_branch_slugs')
      .select('branch_id')
      .eq('movie_id', canonical.id);
    const takenBranches = new Set((canonicalSlugBranches ?? []).map((r) => r.branch_id));

    const { data: duplicateSlugs } = await supabase
      .from('movie_branch_slugs')
      .select('movie_id, branch_id')
      .in('movie_id', duplicateIds);

    for (const row of duplicateSlugs ?? []) {
      if (takenBranches.has(row.branch_id)) continue;
      await supabase
        .from('movie_branch_slugs')
        .update({ movie_id: canonical.id })
        .eq('movie_id', row.movie_id)
        .eq('branch_id', row.branch_id);
      takenBranches.add(row.branch_id);
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

    const { error: deleteError } = await supabase
      .from('movies')
      .delete()
      .in('id', duplicateIds);
    if (deleteError) throw new Error(`Failed to delete duplicate movies: ${deleteError.message}`);

    groupsMerged += 1;
    rowsDeleted += duplicateIds.length;
  }

  return { groupsMerged, rowsDeleted };
}
