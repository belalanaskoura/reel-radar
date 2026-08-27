// Caches a real, already-verified admin check for a short window so
// rapid /admin tab-to-tab navigation doesn't pay a fresh
// supabase.auth.getUser() network round-trip (confirmed live at ~370ms)
// on every single click. The cookie itself carries the verified
// identity, signed by this server-only secret -- proxy.ts only ever
// mints one right after a real getUser() call has confirmed
// isAdminUser(), and only ever trusts one whose signature it can
// reproduce, so a forged or tampered value can't grant admin on its own
// (unlike ADMIN_VERIFIED_HEADER, which is a same-request signal and
// carries no risk of replay across requests -- this cookie is the
// opposite: it's designed to be reused across several requests within
// CACHE_TTL_MS, so it needs its own integrity check).
//
// Uses Web Crypto (globalThis.crypto.subtle), not node:crypto -- this
// module is imported from proxy.ts, which runs in the Edge runtime by
// default (no `export const runtime = 'nodejs'` override), and Node's
// crypto module isn't available there. Web Crypto is available in both
// runtimes.
export const ADMIN_SESSION_COOKIE = 'admin-verified';
const CACHE_TTL_MS = 60_000;

function textToBytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set');
  return crypto.subtle.importKey('raw', textToBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, textToBytes(payload));
  return bytesToBase64Url(signature);
}

// Hash of the raw Supabase auth cookie value(s) this verification was
// tied to -- not the value itself, so the cache cookie never carries the
// real session token. Sign-out, sign-in, and a token refresh all change
// this, which invalidates the cache immediately rather than leaving it
// valid for up to CACHE_TTL_MS after any of those (a real privilege-
// persistence gap a plain TTL alone would have: someone who signs out
// mid-window would otherwise keep a working admin-verified cookie for
// up to 60 more seconds).
export async function hashAuthCookies(rawCookieValues: string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textToBytes(rawCookieValues.join('|')));
  return bytesToBase64Url(digest);
}

export async function mintAdminSessionCookie(userId: string, email: string, authCookiesHash: string): Promise<string> {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  const payload = `${userId}:${email.toLowerCase()}:${expiresAt}:${authCookiesHash}`;
  return `${payload}:${await sign(payload)}`;
}

// Verifies the cookie's own signature, expiry, and that it's still tied
// to the request's CURRENT auth cookies -- null if the cookie is
// missing, malformed, expired, fails signature verification, or was
// minted for a since-changed session. Deliberately does NOT re-check
// the identity against a fresh getUser() call: skipping that exact
// network round-trip is the entire point of this cache. The signature
// is what stands in for that re-check -- only proxy.ts, which holds
// ADMIN_SESSION_SECRET, could have minted a value that verifies.
export async function verifyAdminSessionCookie(
  cookieValue: string | undefined,
  currentAuthCookiesHash: string,
): Promise<{ userId: string; email: string } | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split(':');
  if (parts.length !== 5) return null;
  const [userId, email, expiresAtStr, authCookiesHash, signature] = parts;
  const payload = `${userId}:${email}:${expiresAtStr}:${authCookiesHash}`;
  const expected = await sign(payload);

  if (!timingSafeEqual(signature, expected)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  if (authCookiesHash !== currentAuthCookiesHash) return null;

  return { userId, email };
}
