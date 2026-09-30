import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time check of the x-sync-secret header the external scheduler
// (and admin/actions.ts's triggerJob) sends.
//
// Replaces a plain `secret !== process.env.SYNC_SECRET` in every job
// route. String !== short-circuits on the first differing byte, so how
// long the comparison takes leaks how much of the prefix was right.
// Remote timing attacks against a serverless function are noisy and slow,
// so this was never the most urgent thing in the audit -- but it costs
// nothing to be correct.
//
// Both sides are hashed before comparison so they're always the same
// length: timingSafeEqual throws on a length mismatch, and guarding that
// with an early length check would leak the secret's length instead.
export function verifySyncSecret(request: Request): boolean {
  return secretsMatch(request.headers.get('x-sync-secret'), process.env.SYNC_SECRET);
}

// Vercel Cron's own auth: it calls the scheduled path with GET and an
// `Authorization: Bearer <CRON_SECRET>` header, set from the project's
// CRON_SECRET env var. Kept separate from SYNC_SECRET so the Vercel-side
// secret can be rotated without touching the external scheduler's jobs.
export function verifyCronSecret(request: Request): boolean {
  const header = request.headers.get('authorization');
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  return secretsMatch(provided, process.env.CRON_SECRET);
}

function secretsMatch(provided: string | null, expected: string | undefined): boolean {
  // No secret configured means no request can be authorized. Failing
  // closed here matters: an unset env var in a new environment would
  // otherwise make `undefined === undefined` authorize everyone.
  if (!expected) return false;
  if (!provided) return false;

  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();

  return timingSafeEqual(providedHash, expectedHash);
}
