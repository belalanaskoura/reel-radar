// Local, synthetic stress test -- no network, no DB, no external service.
// Simulates the exact loop shape notifyWatchers / notifyLineupAdditions /
// sendBroadcast / notifyNewReleases / welcome-email all now use: N users,
// each with a small number of sequential-per-user awaits (profile lookup,
// email send, delivery log insert, push send, delivery log insert,
// notification_log insert), run through a bounded-concurrency worker pool
// at concurrency=10, matching every real call site's constant as of this
// writing (grep NOTIFY_CONCURRENCY/BROADCAST_CONCURRENCY/WELCOME_CONCURRENCY
// across src/ to confirm -- a future change to any one of those constants
// would make this script's own hardcoded 10 drift from reality).
//
// mapWithConcurrency is reimplemented inline below rather than imported
// from src/lib/concurrency.ts, deliberately -- this script stays
// dependency-free (no TS, no path aliases, no build step) the same way it
// always has. Keep this copy in sync with src/lib/concurrency.ts by hand;
// src/lib/concurrency.test.ts is the source of truth for its real behavior.
//
// This originally compared the app's actual pattern (fully sequential, no
// concurrency cap) against a bounded-concurrency fix -- that finding
// (docs/SCALABILITY_AUDIT.md #1/#11) has since been fixed everywhere the
// audit flagged. This version instead answers the current question: at
// concurrency=10, where is *today's* real breaking point against
// cron-job.org's 30s job timeout and Vercel Hobby's 10s default function
// timeout?
//
// Run with: node scripts/stress/notification-fanout.mjs

function randDelay(min, max) {
  return min + Math.random() * (max - min);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One simulated "notify one user" unit of work, matching notifyWatchers'
// real await count: profile select, email send, delivery insert, push send,
// delivery insert, notification_log insert = 6 sequential I/O calls.
async function simulateNotifyOneUser() {
  await sleep(randDelay(50, 150)); // profile select
  await sleep(randDelay(200, 500)); // email send (Resend)
  await sleep(randDelay(50, 150)); // delivery insert
  await sleep(randDelay(100, 300)); // push send (web-push)
  await sleep(randDelay(50, 150)); // delivery insert
  await sleep(randDelay(50, 150)); // notification_log insert
}

async function mapWithConcurrency(items, size, fn) {
  const results = new Array(items.length);
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

const REAL_CONCURRENCY = 10; // see NOTIFY_CONCURRENCY/BROADCAST_CONCURRENCY/etc. across src/

async function runConcurrent(n, concurrency) {
  const start = performance.now();
  await mapWithConcurrency(Array.from({ length: n }), concurrency, () => simulateNotifyOneUser());
  return performance.now() - start;
}

const CRON_JOB_TIMEOUT_MS = 30_000;
const VERCEL_HOBBY_TIMEOUT_MS = 10_000;

// Scaled past the audit's original 100 -- concurrency=10 pushed the real
// breaking point out further than the old sequential-only scale showed.
const scales = [10, 22, 50, 100, 250, 400];

console.log(`Simulating the app's real fan-out pattern at concurrency=${REAL_CONCURRENCY}.\n`);
console.log('watchers | wall time (ms) | exceeds cron 30s? | exceeds Vercel Hobby 10s?');
console.log('---------|----------------|--------------------|---------------------------');

for (const n of scales) {
  const ms = await runConcurrent(n, REAL_CONCURRENCY);
  const exceedsCron = ms > CRON_JOB_TIMEOUT_MS ? 'YES' : 'no';
  const exceedsVercel = ms > VERCEL_HOBBY_TIMEOUT_MS ? 'YES' : 'no';
  console.log(
    `${String(n).padEnd(8)} | ${ms.toFixed(0).padEnd(14)} | ${exceedsCron.padEnd(18)} | ${exceedsVercel}`,
  );
}
