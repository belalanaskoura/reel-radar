/**
 * Real Supabase load test -- concurrent-write behavior, separate question
 * from browse-query-scale.ts's single-query latency. Simulates what a real
 * notifyWatchers/sendBroadcast run actually does at concurrency=10 (see
 * src/lib/concurrency.ts and docs/SCALABILITY_AUDIT.md finding 1's
 * "Update, 2026-08-27" section): many workers writing notification_log and
 * notification_deliveries rows for different users at the same time. Checks
 * for real lock contention or throughput cliffs on Supabase's free tier
 * under that access pattern -- something notification-fanout.mjs's
 * synthetic sleep-based simulation can't tell you, since it never touches
 * a real database.
 *
 * notification_log/notification_deliveries/watchlist all have a real FK to
 * auth.users, so (unlike browse-query-scale.ts) this needs real user
 * accounts. Creates a small pool of throwaway users via the admin API,
 * reuses them across every concurrency scale tested, and deletes both the
 * users and every row they own at the end (auth.users deletion cascades to
 * all three tables per their ON DELETE CASCADE FKs).
 *
 * Runs ONLY against a dedicated test Supabase project -- see
 * scripts/stress/_lib/test-project-client.ts and docs/LOAD_TESTING.md.
 *
 * Run with: npx tsx scripts/stress/concurrent-write-load.ts
 */
import { getTestProjectClient } from './_lib/test-project-client';

const RUN_TAG = `loadtest-${Date.now()}`;
const USER_POOL_SIZE = 50;
const CONCURRENCY_SCALES = [1, 10, 25, 50];

async function mapWithConcurrency<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

async function seedUsers(supabase: ReturnType<typeof getTestProjectClient>): Promise<string[]> {
  const userIds: string[] = [];
  for (let i = 0; i < USER_POOL_SIZE; i++) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: `${RUN_TAG}-user-${i}@example.invalid`,
      email_confirm: true,
      password: crypto.randomUUID(),
    });
    if (error || !data.user) {
      throw new Error(`Failed to create test user ${i}: ${error?.message}`);
    }
    userIds.push(data.user.id);
  }
  return userIds;
}

async function seedOneMovie(supabase: ReturnType<typeof getTestProjectClient>): Promise<string> {
  const { data, error } = await supabase
    .from('movies')
    .insert({
      title: `${RUN_TAG} Movie`,
      normalized_title: `${RUN_TAG.toLowerCase()} movie`,
      match_status: 'matched',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to seed movie: ${error?.message}`);
  return data.id;
}

// One simulated "write this user's notification records" unit, matching
// the real shape notifyWatchers writes per watcher: a notification_log row
// plus two notification_deliveries rows (email + push).
async function writeNotificationRecordsForUser(
  supabase: ReturnType<typeof getTestProjectClient>,
  userId: string,
  movieId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error: logError } = await supabase.from('notification_log').insert({
    user_id: userId,
    movie_id: movieId,
    kind: 'showtime',
    branch_id: null,
    title: 'Load test',
    message: 'Load test notification',
  });
  if (logError) return { ok: false, error: `notification_log: ${logError.message}` };

  const { error: deliveryError } = await supabase.from('notification_deliveries').insert([
    { user_id: userId, movie_id: movieId, channel: 'email', success: true },
    { user_id: userId, movie_id: movieId, channel: 'push', success: true },
  ]);
  if (deliveryError) return { ok: false, error: `notification_deliveries: ${deliveryError.message}` };

  return { ok: true };
}

async function runAtConcurrency(
  supabase: ReturnType<typeof getTestProjectClient>,
  userIds: string[],
  movieId: string,
  concurrency: number,
): Promise<{ ms: number; failures: number }> {
  // Fresh notification_log rows each scale -- showtime kind has a real
  // unique index on (user_id, movie_id, branch_id), so a prior scale's
  // rows must be cleared first or every insert here would 23505.
  await supabase.from('notification_log').delete().eq('movie_id', movieId);
  await supabase.from('notification_deliveries').delete().eq('movie_id', movieId);

  const start = performance.now();
  const results = await mapWithConcurrency(userIds, concurrency, (userId) =>
    writeNotificationRecordsForUser(supabase, userId, movieId),
  );
  const ms = performance.now() - start;
  const failures = results.filter((r) => !r.ok).length;
  if (failures > 0) {
    console.error(
      '  sample failure:',
      results.find((r) => !r.ok)?.error,
    );
  }
  return { ms, failures };
}

async function cleanup(
  supabase: ReturnType<typeof getTestProjectClient>,
  userIds: string[],
  movieId: string,
) {
  console.log('\nCleaning up seeded rows and test users...');
  // Deleting the movie cascades to notification_log/notification_deliveries
  // rows referencing it; deleting each user cascades to any rows that
  // reference them directly (watchlist, push_subscriptions, etc.), though
  // this script doesn't write to those.
  const { error: movieError } = await supabase.from('movies').delete().eq('id', movieId);
  if (movieError) console.error(`Cleanup warning (movie): ${movieError.message}`);

  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) console.error(`Cleanup warning (user ${userId}): ${error.message}`);
  }
  console.log('Cleanup done.');
}

async function main() {
  const supabase = getTestProjectClient();
  console.log(`Run tag: ${RUN_TAG}`);
  console.log(`Seeding ${USER_POOL_SIZE} throwaway test users...`);

  const userIds = await seedUsers(supabase);
  const movieId = await seedOneMovie(supabase);

  console.log('\nconcurrency | users | wall time (ms) | failures');
  console.log('------------|-------|----------------|----------');

  try {
    for (const concurrency of CONCURRENCY_SCALES) {
      const { ms, failures } = await runAtConcurrency(supabase, userIds, movieId, concurrency);
      console.log(
        `${String(concurrency).padEnd(11)} | ${String(userIds.length).padEnd(5)} | ${ms.toFixed(0).padEnd(14)} | ${failures}`,
      );
    }
  } finally {
    await cleanup(supabase, userIds, movieId);
  }
}

main().catch((err) => {
  console.error('\nLoad test failed:', err.message);
  process.exit(1);
});
