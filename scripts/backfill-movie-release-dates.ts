/**
 * One-off correction: re-checks every already-matched `movies` row's
 * release_date against elCinema (via getEgyptReleaseDate, same lookup
 * sync-movies/match-to-tmdb now use going forward) and updates it where
 * elCinema has a real, different answer. Needed because existing rows
 * were populated before this pipeline existed and won't self-correct.
 *
 * Dry run by default -- prints what would change without writing
 * anything. Run with
 * `npx tsx scripts/backfill-movie-release-dates.ts --live` to actually
 * apply the updates.
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
  logDryRunBanner('backfill-movie-release-dates');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, tmdb_id, title, release_date')
    .not('tmdb_id', 'is', null);

  if (error) throw new Error(`Failed to load movies: ${error.message}`);
  if (!movies) return;

  console.log(`Checking ${movies.length} movies against elCinema...`);

  let updated = 0;
  let unchanged = 0;
  let noElCinemaData = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    try {
      const egyptInfo = await getEgyptReleaseInfo(supabase, movie.tmdb_id!, movie.title);
      const egyptDate = egyptInfo.releaseDate;

      if (!egyptDate) {
        noElCinemaData += 1;
      } else if (egyptDate !== movie.release_date) {
        if (!isDryRun()) {
          await supabase.from('movies').update({ release_date: egyptDate }).eq('id', movie.id);
        }
        console.log(`  ${isDryRun() ? 'would update' : 'updated'}: "${movie.title}" ${movie.release_date} -> ${egyptDate}`);
        updated += 1;
      } else {
        unchanged += 1;
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
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged (already correct): ${unchanged}`);
  console.log(`No elCinema data (kept TMDB date): ${noElCinemaData}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
