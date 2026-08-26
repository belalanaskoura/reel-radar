/**
 * One-time cleanup for duplicate `movies` rows that predate the
 * scrape-scene/scrape-vox/sync-movies title-check fix (see
 * find-existing-movie.ts) and the reconciliation pass added to
 * mergeSceneDuplicates (see merge-scene-duplicates.ts). Two independent
 * insertion paths -- TMDB sync (tmdb_id set) and Scene/VOX scraping
 * (tmdb_id null) -- never checked each other's titles before creating a
 * row, so the same real movie could end up as several disconnected rows,
 * confirmed for real with "The End of Oak Street" (3 rows) and 5 other
 * titles in the live catalog.
 *
 * Reuses mergeSceneDuplicates directly (exact-title pass, fuzzy-title
 * pass, then the new tmdb_id-having reconciliation pass) so this cleanup
 * behaves identically to what every future /api/match-movies run now
 * does automatically -- not a separate one-off implementation.
 *
 * No --live flag here unlike this directory's other scripts: the actual
 * merge/delete logic lives inside mergeSceneDuplicates itself (it's also
 * called live, unconditionally, by every /api/match-movies run), so there
 * is no local write call site in this file to gate -- adding a dry-run
 * flag here would either silently skip calling the shared function
 * entirely or do nothing, neither of which matches what this script's own
 * name promises. If a dry-run mode is ever wanted for this, it belongs
 * inside mergeSceneDuplicates so both callers get it consistently.
 *
 * Run with `npx tsx scripts/cleanup-title-duplicates.ts`.
 */
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k) process.env[k] = v.join('=');
  });

async function main() {
  const { createServiceRoleClient } = await import('../src/lib/supabase/service-role');
  const { mergeSceneDuplicates } = await import('../src/lib/matching/merge-scene-duplicates');

  const supabase = createServiceRoleClient();
  const result = await mergeSceneDuplicates(supabase);
  console.log(`groupsMerged: ${result.groupsMerged}, rowsDeleted: ${result.rowsDeleted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
