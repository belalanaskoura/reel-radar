/**
 * Ad-hoc one-off: manually runs the merge+match pipeline against the live
 * DB, same as POST /api/match-movies, to check whether recently-scraped
 * placeholders (e.g. "Pinocchio: Unstrung", "Above & Below") resolve now
 * that a run is actually happening, since the external cron schedule may
 * not have fired since they were created.
 *
 * Run with `npx tsx scripts/run-match-once.ts`.
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
  const { matchScenesToTmdb } = await import('../src/lib/matching/match-to-tmdb');

  const supabase = createServiceRoleClient();
  const mergeResult = await mergeSceneDuplicates(supabase);
  console.log('merge:', mergeResult);

  const matchResults = await matchScenesToTmdb(supabase);
  console.log(`match results: ${matchResults.length} total`);
  const summary = {
    matched: matchResults.filter((r) => r.outcome === 'matched').length,
    ambiguous: matchResults.filter((r) => r.outcome === 'ambiguous').length,
    unmatched: matchResults.filter((r) => r.outcome === 'unmatched').length,
  };
  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
