/**
 * One-time backfill for VOX-linked `movies` rows with no poster_path,
 * predating scrape-vox's new poster fallback (see scrape-vox/route.ts):
 * previously scrape-vox never set a poster at all, so a VOX-only movie
 * (not yet listed on Scene, not yet TMDB-matched) had no poster source
 * whatsoever until a TMDB match happened to land. Confirmed for real:
 * "Pinocchio: Unstrung" showed "No poster yet" on browse despite being
 * bookable at VOX Mall of Egypt.
 *
 * Reuses fetchWorkDetails(elcinemaId) directly -- the same call
 * scrape-vox itself now makes for any newly-discovered poster-less movie
 * going forward -- so this is a one-time catch-up for existing rows, not
 * a separate implementation.
 *
 * Run with `npx tsx scripts/backfill-vox-posters.ts`.
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
  const { fetchWorkDetails, sleep, REQUEST_DELAY_MS } = await import('../src/lib/elcinema/fetcher');

  const supabase = createServiceRoleClient();

  const { data: voxSlugs, error: slugError } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id, branch_id, slug')
    .like('branch_id', 'vox-%');
  if (slugError) throw new Error(`Failed to load movie_branch_slugs: ${slugError.message}`);

  const elcinemaIdByMovieId = new Map<string, number>();
  for (const row of voxSlugs ?? []) {
    const elcinemaId = Number(row.slug);
    if (Number.isFinite(elcinemaId)) elcinemaIdByMovieId.set(row.movie_id, elcinemaId);
  }

  const movieIds = [...elcinemaIdByMovieId.keys()];
  const { data: movies, error: moviesError } = await supabase
    .from('movies')
    .select('id, title, poster_path')
    .in('id', movieIds);
  if (moviesError) throw new Error(`Failed to load movies: ${moviesError.message}`);

  const posterless = (movies ?? []).filter((m) => !m.poster_path);
  console.log(`Found ${posterless.length} VOX-linked movie(s) with no poster.`);

  let updated = 0;
  for (const movie of posterless) {
    const elcinemaId = elcinemaIdByMovieId.get(movie.id)!;
    try {
      await sleep(REQUEST_DELAY_MS);
      const details = await fetchWorkDetails(elcinemaId);
      if (details.posterUrl) {
        await supabase.from('movies').update({ poster_path: details.posterUrl }).eq('id', movie.id);
        console.log(`  "${movie.title}": set poster`);
        updated += 1;
      } else {
        console.log(`  "${movie.title}": elCinema has no poster either`);
      }
    } catch (err) {
      console.warn(`  "${movie.title}": failed (${String(err)})`);
    }
  }

  console.log(`Done. Updated ${updated} of ${posterless.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
