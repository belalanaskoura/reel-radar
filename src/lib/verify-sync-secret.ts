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
  const expected = process.env.SYNC_SECRET;

  // No secret configured means no request can be authorized. Failing
  // closed here matters: an unset env var in a new environment would
  // otherwise make `undefined === undefined` authorize everyone.
  if (!expected) return false;

  const provided = request.headers.get('x-sync-secret');
  if (!provided) return false;

  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();

  return timingSafeEqual(providedHash, expectedHash);
}
