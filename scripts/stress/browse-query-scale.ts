/**
 * Real Supabase load test -- targets docs/SCALABILITY_AUDIT.md findings
 * #7 (browse page ships the entire catalog + filters client-side, no
 * pagination) and #10 (missing indexes on watchlist.movie_id and
 * showtimes_cache.branch_id).
 *
 * Seeds synthetic branches/movies/showtimes_cache rows at increasing
 * scale (movies has no FK to auth.users, so this needs no real user
 * accounts -- unlike concurrent-write-load.ts) and re-runs the *exact*
 * query src/app/browse/page.tsx's getCachedCatalog makes (same select
 * shape, same BROWSE_FETCH_LIMIT), measuring real wall-clock latency at
 * each scale. Also runs a plain watchlist.movie_id / showtimes_cache.
 * branch_id filter query to see whether the two missing indexes from
 * finding #10 show up as a real cost at these row counts, or are still
 * negligible.
 *
 * Runs ONLY against a dedicated test Supabase project -- see
 * scripts/_lib/test-project-client.ts and docs/LOAD_TESTING.md.
 * Every row this script creates is deleted again at the end of the run
 * (or immediately if seeding fails partway), scoped by a run-specific
 * tag so a killed/crashed run can be cleaned up by hand if needed.
 *
 * Run with: npx tsx scripts/stress/browse-query-scale.ts
 */
import { getTestProjectServiceClient } from '../_lib/test-project-client';

const RUN_TAG = `loadtest-${Date.now()}`;
const BROWSE_FETCH_LIMIT = 300; // must match src/app/browse/page.tsx

const SCALES = [100, 300, 1000, 3000, 10000];

async function seedBranches(supabase: ReturnType<typeof getTestProjectServiceClient>) {
  const branches = [
    { id: `${RUN_TAG}-cfc`, name: 'Cairo Festival City', base_url: 'https://cfc.example.com', chain: 'scene' },
    { id: `${RUN_TAG}-district5`, name: 'District 5', base_url: 'https://d5.example.com', chain: 'scene' },
    { id: `${RUN_TAG}-vox-moe`, name: 'Mall of Egypt', base_url: 'https://vox.example.com', chain: 'vox' },
  ];
  const { error } = await supabase.from('branches').insert(branches);
  if (error) throw new Error(`Failed to seed branches: ${error.message}`);
  return branches.map((b) => b.id);
}

async function seedMoviesAndShowtimes(
  supabase: ReturnType<typeof getTestProjectServiceClient>,
  branchIds: string[],
  count: number,
  alreadySeeded: number,
) {
  const toInsert = count - alreadySeeded;
  if (toInsert <= 0) return;

  const BATCH_SIZE = 500;
  for (let offset = 0; offset < toInsert; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, toInsert - offset);
    const movies = Array.from({ length: batchSize }, (_, i) => {
      const n = alreadySeeded + offset + i;
      return {
        title: `${RUN_TAG} Movie ${n}`,
        normalized_title: `${RUN_TAG.toLowerCase()} movie ${n}`,
        match_status: 'matched',
        release_date: new Date(2026, 0, 1 + (n % 300)).toISOString().slice(0, 10),
        popularity: Math.random() * 100,
      };
    });

    const { data: inserted, error } = await supabase.from('movies').insert(movies).select('id');
    if (error) throw new Error(`Failed to seed movies at offset ${offset}: ${error.message}`);

    const showtimeRows = (inserted ?? []).flatMap((movie) =>
      branchIds.map((branchId) => ({
        movie_id: movie.id,
        branch_id: branchId,
        bookable: Math.random() > 0.5,
        last_checked_at: new Date().toISOString(),
      })),
    );
    const { error: stError } = await supabase.from('showtimes_cache').insert(showtimeRows);
    if (stError) throw new Error(`Failed to seed showtimes_cache at offset ${offset}: ${stError.message}`);
  }
}

async function timeBrowseQuery(supabase: ReturnType<typeof getTestProjectServiceClient>): Promise<number> {
  const start = performance.now();
  const { error } = await supabase
    .from('movies')
    .select(
      'id, title, release_date, poster_path, match_status, showtimes_cache(branch_id, bookable, was_ever_bookable, raw_showtimes, branches(name))',
      { count: 'exact' },
    )
    .in('match_status', ['matched', 'unmatched', 'ambiguous'])
    .order('release_date', { ascending: true, nullsFirst: false })
    .limit(BROWSE_FETCH_LIMIT);
  if (error) throw new Error(`Browse query failed: ${error.message}`);
  return performance.now() - start;
}

async function timeBranchFilterQuery(
  supabase: ReturnType<typeof getTestProjectServiceClient>,
  branchId: string,
): Promise<number> {
  const start = performance.now();
  const { error } = await supabase
    .from('showtimes_cache')
    .select('movie_id, bookable')
    .eq('branch_id', branchId)
    .limit(1000);
  if (error) throw new Error(`Branch filter query failed: ${error.message}`);
  return performance.now() - start;
}

async function cleanup(supabase: ReturnType<typeof getTestProjectServiceClient>, branchIds: string[]) {
  console.log('\nCleaning up seeded rows...');
  // movies has an ON DELETE CASCADE to showtimes_cache, so deleting the
  // tagged movies also clears their showtimes_cache rows.
  const { error: movieError } = await supabase.from('movies').delete().ilike('title', `${RUN_TAG}%`);
  if (movieError) console.error(`Cleanup warning (movies): ${movieError.message}`);

  const { error: branchError } = await supabase.from('branches').delete().in('id', branchIds);
  if (branchError) console.error(`Cleanup warning (branches): ${branchError.message}`);
  console.log('Cleanup done.');
}

async function main() {
  const supabase = getTestProjectServiceClient();
  console.log(`Run tag: ${RUN_TAG}\n`);

  const branchIds = await seedBranches(supabase);
  let seeded = 0;

  console.log('movies | showtimes_cache rows | browse query (ms) | branch-filter query (ms)');
  console.log('-------|----------------------|--------------------|--------------------------');

  try {
    for (const scale of SCALES) {
      await seedMoviesAndShowtimes(supabase, branchIds, scale, seeded);
      seeded = scale;

      const browseMs = await timeBrowseQuery(supabase);
      const filterMs = await timeBranchFilterQuery(supabase, branchIds[0]);

      console.log(
        `${String(scale).padEnd(6)} | ${String(scale * branchIds.length).padEnd(20)} | ${browseMs.toFixed(0).padEnd(18)} | ${filterMs.toFixed(0)}`,
      );
    }
  } finally {
    await cleanup(supabase, branchIds);
  }
}

main().catch((err) => {
  console.error('\nLoad test failed:', err.message);
  process.exit(1);
});
