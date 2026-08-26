/**
 * One-off cleanup: /api/scrape-scene has a check-then-insert race on
 * (branch_id, slug) -- it reads movie_branch_slugs for an existing link,
 * and if none is found, inserts a new placeholder `movies` row + slug
 * link, with no unique constraint to catch two runs doing this for the
 * same never-before-seen slug at nearly the same time. Once the external
 * scheduler started actually running /api/scrape-scene every 30 min,
 * this produced 4 separate "Toy Story 5 DUB" placeholder rows all
 * pointing at the identical (cfc, toy-story-5-arabic-dubbing) slug.
 *
 * This script finds every (branch_id, slug) key with more than one
 * movie_branch_slugs row, keeps the oldest movies row per key as
 * canonical, repoints any showtimes_cache rows on the duplicates onto
 * the canonical movie_id, deletes the duplicate movie_branch_slugs
 * rows, then deletes the now-orphaned duplicate `movies` rows.
 *
 * Meant to run once, before adding the real fix: a UNIQUE constraint on
 * movie_branch_slugs(branch_id, slug) -- see CLAUDE.md for the exact SQL,
 * given directly rather than as a migration file per the no-.sql-files
 * convention.
 *
 * Dry run by default -- prints what would change without touching
 * anything. Run with
 * `npx tsx scripts/dedupe-slug-race-condition.ts --live` to actually
 * apply the repoint + delete.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isDryRun, logDryRunBanner } from './_lib/dry-run';

const envPath = path.resolve(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k) process.env[k] = v.join('=');
  });

async function main() {
  logDryRunBanner('dedupe-slug-race-condition');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: allSlugs, error } = await supabase
    .from('movie_branch_slugs')
    .select('branch_id, slug, movie_id');
  if (error) throw new Error(`Failed to load movie_branch_slugs: ${error.message}`);
  if (!allSlugs) return;

  const byKey = new Map<string, string[]>();
  for (const row of allSlugs) {
    const key = `${row.branch_id}::${row.slug}`;
    const group = byKey.get(key) ?? [];
    group.push(row.movie_id);
    byKey.set(key, group);
  }

  const duplicateGroups = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`Found ${duplicateGroups.length} duplicated (branch_id, slug) key(s).`);

  let groupsFixed = 0;
  let rowsDeleted = 0;

  for (const [key, movieIds] of duplicateGroups) {
    const [branchId, slug] = key.split('::');

    const { data: movieRows } = await supabase
      .from('movies')
      .select('id, title, created_at')
      .in('id', movieIds)
      .order('created_at', { ascending: true });

    if (!movieRows || movieRows.length < 2) continue;

    const [canonical, ...duplicates] = movieRows;
    const duplicateIds = duplicates.map((m) => m.id);
    console.log(`\n${key}: keeping "${canonical.title}" (${canonical.id}, oldest)`);

    // Repoint any showtimes_cache rows the duplicates have (unlikely to
    // differ meaningfully since they're all the same slug, but repoint
    // rather than assume) onto the canonical movie, skipping if the
    // canonical row already has a cache entry for that branch.
    const { data: canonicalCache } = await supabase
      .from('showtimes_cache')
      .select('branch_id')
      .eq('movie_id', canonical.id);
    const takenBranches = new Set((canonicalCache ?? []).map((r) => r.branch_id));

    const { data: duplicateCache } = await supabase
      .from('showtimes_cache')
      .select('movie_id, branch_id')
      .in('movie_id', duplicateIds);

    for (const row of duplicateCache ?? []) {
      if (takenBranches.has(row.branch_id)) continue;
      if (!isDryRun()) {
        await supabase
          .from('showtimes_cache')
          .update({ movie_id: canonical.id })
          .eq('movie_id', row.movie_id)
          .eq('branch_id', row.branch_id);
      }
      takenBranches.add(row.branch_id);
    }

    if (isDryRun()) {
      console.log(`  would remove ${duplicateIds.length} duplicate row(s)`);
      groupsFixed += 1;
      rowsDeleted += duplicateIds.length;
      continue;
    }

    // Delete the duplicate slug links first (all point at the same
    // branch_id/slug the canonical row already owns), then the
    // now-unreferenced duplicate movie rows.
    await supabase
      .from('movie_branch_slugs')
      .delete()
      .eq('branch_id', branchId)
      .in('movie_id', duplicateIds);

    const { error: deleteError } = await supabase.from('movies').delete().in('id', duplicateIds);
    if (deleteError) {
      console.warn(`  failed to delete duplicate movies: ${deleteError.message}`);
      continue;
    }

    console.log(`  removed ${duplicateIds.length} duplicate row(s)`);
    groupsFixed += 1;
    rowsDeleted += duplicateIds.length;
  }

  console.log(`\nDone. Fixed ${groupsFixed} group(s), removed ${rowsDeleted} duplicate row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
