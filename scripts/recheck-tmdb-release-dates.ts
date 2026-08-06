/**
 * One-off correction: re-checks every already-matched `movies` row's
 * release_date against the current elCinema/TMDB fallback chain and
 * updates it where either source now disagrees with what's stored.
 *
 * This is a superset of backfill-movie-release-dates.ts's elCinema
 * check: that script leaves a row alone whenever elCinema has no record
 * of the movie, even though the row's stored date may be a stale TMDB
 * snapshot from whenever it was first synced -- TMDB's own EG
 * release_dates entry for a movie can change after the fact (a
 * previously-unconfirmed date gets confirmed, a placeholder date gets
 * corrected, etc.), and nothing re-checks that path today. Order:
 *   1. elCinema via getEgyptReleaseInfo (existing preferred source --
 *      catches TMDB's raw release_date landing on an unrelated
 *      country's date, e.g. the documented "El Gawahergy" bug).
 *   2. If elCinema has nothing, re-fetch TMDB's current EG theatrical
 *      release_dates entry live (getEgTheatricalReleaseDate) and use it
 *      if different from what's stored.
 *   3. If neither has anything, leave the row untouched.
 *
 * Run once with `npx tsx scripts/recheck-tmdb-release-dates.ts`.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k) process.env[k] = v.join('=');
  });

import { getEgyptReleaseInfo } from '../src/lib/matching/egypt-release-date';
import { getEgTheatricalReleaseDate } from '../src/lib/tmdb';

async function main() {
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

  console.log(`Checking ${movies.length} movies against elCinema, then live TMDB...`);

  let updatedFromElCinema = 0;
  let updatedFromTmdb = 0;
  let unchanged = 0;
  let noDataAnywhere = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    try {
      const egyptInfo = await getEgyptReleaseInfo(supabase, movie.tmdb_id!, movie.title);

      if (egyptInfo.releaseDate) {
        if (egyptInfo.releaseDate !== movie.release_date) {
          await supabase
            .from('movies')
            .update({ release_date: egyptInfo.releaseDate })
            .eq('id', movie.id);
          console.log(
            `  updated (elCinema): "${movie.title}" ${movie.release_date} -> ${egyptInfo.releaseDate}`,
          );
          updatedFromElCinema += 1;
        } else {
          unchanged += 1;
        }
        continue;
      }

      // elCinema has no record; re-check TMDB's live EG theatrical
      // entry rather than trusting whatever snapshot is already stored.
      const tmdbDate = await getEgTheatricalReleaseDate(movie.tmdb_id!);

      if (tmdbDate && tmdbDate !== movie.release_date) {
        await supabase.from('movies').update({ release_date: tmdbDate }).eq('id', movie.id);
        console.log(`  updated (TMDB): "${movie.title}" ${movie.release_date} -> ${tmdbDate}`);
        updatedFromTmdb += 1;
      } else if (tmdbDate) {
        unchanged += 1;
      } else {
        noDataAnywhere += 1;
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
  console.log(`Updated from elCinema: ${updatedFromElCinema}`);
  console.log(`Updated from live TMDB re-check: ${updatedFromTmdb}`);
  console.log(`Unchanged (already correct): ${unchanged}`);
  console.log(`No data anywhere (kept existing value): ${noDataAnywhere}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
