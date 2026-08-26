// Real web-push service hosts.
//
// A push endpoint is a URL this server later POSTs to (web-push does the
// send, see push.ts). It used to be stored verbatim from whatever the
// client sent, with no validation at all, so a signed-in user could
// register an internal address or one they control and have us request it
// on the next notification or broadcast. Blind SSRF, but ours to close.
//
// Matched on a subdomain boundary rather than a suffix, or
// "evilfcm.googleapis.com" would pass -- the same shape isAllowedHost in
// the poster proxy already gets right.
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
  'web.push.apple.com',
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ALLOWED_PUSH_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
  );
}

// One person's devices. Without a ceiling, a script can register unbounded
// rows against a single account and every future notification fans out
// across all of them.
export const MAX_SUBSCRIPTIONS_PER_USER = 20;
