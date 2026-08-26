// Local, synthetic stress test -- no network, no DB, no external service.
// Simulates the exact loop shape found in notifyWatchers / notifyLineupAdditions /
// sendBroadcast: N users, each with a small number of sequential awaits
// (profile lookup, email send, delivery log insert, push send, delivery log
// insert, notification_log insert), at latencies representative of the real
// calls those functions make (Supabase ~50-150ms, Resend ~200-500ms, web-push
// ~100-300ms -- estimates documented in docs/SCALABILITY_AUDIT.md, not
// measured against the real services here).
//
// Compares the app's actual pattern (fully sequential, no concurrency cap)
// against a bounded-concurrency version using the same mapWithConcurrency
// shape already duplicated in src/app/api/sync-movies/route.ts and
// src/app/cinemas/[id]/actions.ts, to quantify the real wall-clock gap and
// check it against real constraints: cron-job.org's 30s job timeout and
// Vercel Hobby's default 10s serverless function timeout.
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

async function mapWithConcurrency(items, concurrency, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function runSequential(n) {
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    await simulateNotifyOneUser();
  }
  return performance.now() - start;
}

async function runConcurrent(n, concurrency) {
  const start = performance.now();
  await mapWithConcurrency(Array.from({ length: n }), concurrency, () => simulateNotifyOneUser());
  return performance.now() - start;
}

const CRON_JOB_TIMEOUT_MS = 30_000;
const VERCEL_HOBBY_TIMEOUT_MS = 10_000;

const scales = [10, 22, 50, 100];

console.log('watchers | sequential (ms) | concurrency=10 (ms) | seq > cron 30s? | seq > vercel 10s?');
console.log('---------|-----------------|----------------------|-----------------|-------------------');

for (const n of scales) {
  const seqMs = await runSequential(n);
  const concMs = await runConcurrent(n, 10);
  const seqExceedsCron = seqMs > CRON_JOB_TIMEOUT_MS ? 'YES' : 'no';
  const seqExceedsVercel = seqMs > VERCEL_HOBBY_TIMEOUT_MS ? 'YES' : 'no';
  console.log(
    `${String(n).padEnd(8)} | ${seqMs.toFixed(0).padEnd(15)} | ${concMs.toFixed(0).padEnd(20)} | ${seqExceedsCron.padEnd(15)} | ${seqExceedsVercel}`,
  );
}
