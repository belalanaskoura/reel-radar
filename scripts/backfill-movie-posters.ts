/**
 * One-off correction: fills in poster_path for existing `movies` rows
 * that have none, using elCinema as a fallback (via getEgyptReleaseInfo,
 * same lookup sync-movies/match-to-tmdb now use going forward). Needed
 * because existing rows were populated before this fallback existed and
 * won't self-correct.
 *
 * Dry run by default -- prints what would be filled without writing
 * anything. Run with `npx tsx scripts/backfill-movie-posters.ts --live`
 * to actually apply the updates.
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

import { getEgyptReleaseInfo } from '../src/lib/matching/egypt-release-date';

async function main() {
  logDryRunBanner('backfill-movie-posters');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, tmdb_id, title')
    .not('tmdb_id', 'is', null)
    .is('poster_path', null);

  if (error) throw new Error(`Failed to load movies: ${error.message}`);
  if (!movies) return;

  console.log(`Checking ${movies.length} posterless movies against elCinema...`);

  let filled = 0;
  let noElCinemaData = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    try {
      const egyptInfo = await getEgyptReleaseInfo(supabase, movie.tmdb_id!, movie.title);

      if (!egyptInfo.posterUrl) {
        noElCinemaData += 1;
      } else {
        if (!isDryRun()) {
          await supabase.from('movies').update({ poster_path: egyptInfo.posterUrl }).eq('id', movie.id);
        }
        console.log(`  ${isDryRun() ? 'would fill' : 'filled'}: "${movie.title}" -> ${egyptInfo.posterUrl}`);
        filled += 1;
      }
    } catch (err) {
      console.warn(`  failed: "${movie.title}" (${(err as Error).message})`);
      failed += 1;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  progress: ${i + 1}/${movies.length}`);
    }
  }

  console.log('\nDone.');
  console.log(`Filled: ${filled}`);
  console.log(`No elCinema poster available: ${noElCinemaData}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
