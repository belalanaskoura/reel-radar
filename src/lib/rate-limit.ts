import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { logError } from '@/lib/logger';

// Structural type rather than next/headers' ReadonlyHeaders, so this
// accepts both `await headers()` in a server action and a route
// handler's own `request.headers` without a deep import into next/dist.
type HeaderReader = { get(name: string): string | null };

// Fixed-window rate limiter backed by the rate_limits table and the
// check_rate_limit() function (see supabase/migrations/0100_rate_limits.sql
// -- that migration MUST be applied before these limits do anything).
//
// Returns true when the caller may proceed, false when they're over the
// limit.
//
// Fails OPEN. A limiter that fails closed turns a transient database
// blip into a total sign-in outage, which is a worse failure than a
// window of unthrottled requests. The tradeoff is deliberate; the
// console.error is what makes it visible in Vercel's function logs
// rather than silent.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      logError('rate-limit', error, { key });
      return true;
    }

    return data === true;
  } catch (err) {
    logError('rate-limit', err, { key });
    return true;
  }
}

// Best-effort client IP for keying per-IP limits.
//
// On Vercel, x-forwarded-for is set by the platform's edge and the
// left-most entry is the real client. This is spoofable in a deployment
// that sits behind something which doesn't overwrite the header, so
// per-IP limits are a speed bump against untargeted abuse, not an
// identity check -- per-account limits (keyed on a user id) are the ones
// that actually bind.
export function clientIp(headerList: HeaderReader): string {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headerList.get('x-real-ip')?.trim() || 'unknown';
}
