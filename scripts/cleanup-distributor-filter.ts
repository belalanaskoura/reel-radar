/**
 * One-off cleanup: re-checks every existing `movies` row (that has a
 * tmdb_id) against the current egypt-distributor filter
 * (src/lib/matching/egypt-distributor-filter.ts) and removes rows that
 * no longer pass it. Needed because /api/sync-movies only filters
 * candidates going forward on each run; it never re-checks or removes
 * rows already in the catalog from before a filter change (here: raising
 * the minimum distributor release count from 1 to 5).
 *
 * Skips any movie with real Scene data (a row in movie_branch_slugs) --
 * ground truth (it's actually listed at a real cinema) beats a proxy
 * filter built from historical TMDB/elCinema data.
 *
 * Dry run by default -- prints what would be removed without deleting
 * anything. Run with `npx tsx scripts/cleanup-distributor-filter.ts --live`
 * to actually apply the deletions.
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

import { isLikelyEgyptRelease } from '../src/lib/matching/egypt-distributor-filter';
import type { TmdbMovie } from '../src/lib/tmdb';

async function main() {
  logDryRunBanner('cleanup-distributor-filter');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: slugRows, error: slugError } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id');
  if (slugError) throw new Error(`Failed to load movie_branch_slugs: ${slugError.message}`);
  const moviesWithSceneData = new Set((slugRows ?? []).map((r) => r.movie_id));

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, tmdb_id, title, original_title, release_date, popularity')
    .not('tmdb_id', 'is', null);

  if (error) throw new Error(`Failed to load movies: ${error.message}`);
  if (!movies) return;

  console.log(`Checking ${movies.length} movies against the stricter distributor filter...`);

  let removed = 0;
  let kept = 0;
  let skippedSceneData = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];

    if (moviesWithSceneData.has(movie.id)) {
      skippedSceneData += 1;
      continue;
    }

    try {
      const fauxTmdbMovie: TmdbMovie = {
        id: movie.tmdb_id!,
        title: movie.title,
        original_title: movie.original_title ?? movie.title,
        poster_path: null,
        release_date: movie.release_date ?? '',
        popularity: movie.popularity ?? 0,
        original_language: '',
        genre_ids: [],
      };

      const passes = await isLikelyEgyptRelease(supabase, fauxTmdbMovie);

      if (!passes) {
        if (!isDryRun()) {
          await supabase.from('movies').delete().eq('id', movie.id);
        }
        console.log(`  ${isDryRun() ? 'would remove' : 'removed'}: "${movie.title}"`);
        removed += 1;
      } else {
        kept += 1;
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
  console.log(`Removed: ${removed}`);
  console.log(`Kept: ${kept}`);
  console.log(`Skipped (has real Scene data): ${skippedSceneData}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
