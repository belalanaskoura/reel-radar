import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Structured error logging, complementary to analytics.ts's logEvent
// (which records business-metric run summaries -- counts, durations --
// not failures). Before this existed, errors across the scheduled jobs
// and auth paths were either fully swallowed (a bare catch {}, the
// original shape of poll's per-pair error handling) or a raw
// console.error with no consistent shape, visible only if someone
// happened to be looking at Vercel's function logs at the right time --
// nothing persisted them anywhere queryable, and nothing summarized
// them for /admin the way analytics_events already does for run health.
//
// logError still writes to console.error (so Vercel's own log tailing
// and search keep working unchanged) but also best-effort persists a
// structured row to error_log, so /admin can show a real "recent
// errors" view instead of requiring someone to dig through logs after
// the fact.
type ErrorSource =
  | 'poll'
  | 'sync-movies'
  | 'match-movies'
  | 'scrape-scene'
  | 'scrape-scene-delist'
  | 'scrape-vox'
  | 'admin-digest'
  | 'welcome-email'
  | 'broadcast'
  | 'prune-analytics'
  | 'check-scene-prices'
  | 'auth'
  | 'rate-limit'
  | 'render';

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function toStack(err: unknown): string | null {
  if (err instanceof Error && err.stack) return err.stack.slice(0, 4000);
  return null;
}

// Fire-and-forget, same as logEvent: error logging must never itself
// throw or slow down the request/job it's instrumenting. context is a
// small bag of already-known identifiers (movie id, branch, user id)
// useful for grepping console output or filtering the admin view --
// not a dump of the entire surrounding state.
export function logError(source: ErrorSource, err: unknown, context?: Record<string, unknown>) {
  const message = toMessage(err);
  const stack = toStack(err);

  console.error(`[${source}]`, message, context ?? '');

  createServiceRoleClient()
    .from('error_log')
    .insert({
      source,
      message: message.slice(0, 2000),
      stack,
      context: context ?? null,
    })
    .then(
      () => {},
      () => {},
    );
}
