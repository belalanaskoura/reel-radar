/**
 * One-off correction: fills in poster_path for existing `movies` rows
 * that still have none after the TMDB/elCinema fallbacks, using Scene
 * Cinemas' own movie-details page image as a last resort. Only movies
 * with a known movie_branch_slugs entry can be checked -- cfc is tried
 * before district5 when a movie is listed on both. Run once with
 * `npx tsx scripts/backfill-movie-posters-scene.ts`.
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

import { checkBookability, sleep, REQUEST_DELAY_MS } from '../src/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '../src/lib/scene/types';

const BRANCH_PRIORITY: BranchId[] = ['cfc', 'district5'];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, title, movie_branch_slugs(branch_id, slug)')
    .is('poster_path', null);

  if (error) throw new Error(`Failed to load movies: ${error.message}`);
  if (!movies) return;

  const withSlugs = movies.filter((m) => (m.movie_branch_slugs?.length ?? 0) > 0);
  console.log(`Checking ${withSlugs.length} posterless movies with Scene listings...`);

  let filled = 0;
  let noPosterFound = 0;
  let failed = 0;

  for (let i = 0; i < withSlugs.length; i++) {
    const movie = withSlugs[i];
    const slugsByBranch = new Map(
      (movie.movie_branch_slugs ?? []).map((s) => [s.branch_id as BranchId, s.slug]),
    );

    let posterUrl: string | null = null;
    try {
      for (const branch of BRANCH_PRIORITY) {
        const slug = slugsByBranch.get(branch);
        if (!slug) continue;

        const url = `${BRANCH_BASE_URLS[branch]}/movie-details/${slug}.html`;
        const result = await checkBookability(url);
        await sleep(REQUEST_DELAY_MS);

        if (result.posterUrl) {
          posterUrl = result.posterUrl;
          break;
        }
      }

      if (posterUrl) {
        await supabase.from('movies').update({ poster_path: posterUrl }).eq('id', movie.id);
        console.log(`  filled: "${movie.title}" -> ${posterUrl}`);
        filled += 1;
      } else {
        noPosterFound += 1;
      }
    } catch (err) {
      console.warn(`  failed: "${movie.title}" (${(err as Error).message})`);
      failed += 1;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  progress: ${i + 1}/${withSlugs.length}`);
    }
  }

  console.log('\nDone.');
  console.log(`Filled: ${filled}`);
  console.log(`No Scene poster found: ${noPosterFound}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
