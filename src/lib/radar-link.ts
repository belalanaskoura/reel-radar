import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed "Remove from radar" links for emails and push notifications.
//
// The person clicking may have no session cookie (an email client's
// webview, a push banner long after sign-in expired), so the link itself
// carries the authorization: a token naming exactly one (user, movie)
// watchlist row, signed with RADAR_LINK_SECRET. The ids used for the
// delete come only from a verified token, never from a separate request
// parameter, so there's nothing to swap to reach someone else's row.
//
// Format: <userId>.<movieId>.<expiresAtUnixSeconds>.<base64url HMAC>
// The HMAC input is prefixed with a purpose tag so a signature minted
// here can't be replayed against some future token type sharing the key.

const TOKEN_PURPOSE = 'radar-remove:v1';
export const RADAR_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

// Every user gets valid (payload, signature) pairs in their own email, so
// a short secret could be brute-forced offline. Anything shorter than this
// is treated as unset.
export const MIN_SECRET_LENGTH = 32;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RadarLinkClaims {
  userId: string;
  movieId: string;
  expiresAt: number;
  // Unix seconds the token was minted. Used to refuse an old link once the
  // movie has been added back to the radar since.
  issuedAt: number;
}

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${TOKEN_PURPOSE}:${payload}`).digest();
}

export function createRadarToken(
  userId: string,
  movieId: string,
  secret: string,
  nowMs: number = Date.now(),
): string {
  const expiresAt = Math.floor(nowMs / 1000) + RADAR_LINK_TTL_SECONDS;
  const payload = `${userId}.${movieId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

// Returns the claims for a valid, unexpired token, or null for anything
// else. Every failure looks the same to the caller on purpose.
export function verifyRadarToken(
  token: string | null | undefined,
  secret: string | undefined,
  nowMs: number = Date.now(),
): RadarLinkClaims | null {
  // No (or too weak a) secret means no token can be valid (fail closed).
  // The typeof check matters: a repeated ?t= query param arrives as an
  // array.
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) return null;

  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, movieId, expiresAtRaw, signatureRaw] = parts;

  if (!UUID_RE.test(userId) || !UUID_RE.test(movieId)) return null;
  if (!/^\d{1,12}$/.test(expiresAtRaw)) return null;
  // Strict alphabet and length: Buffer's base64url decoder skips junk
  // characters, which would otherwise let many strings map to one token.
  if (!/^[A-Za-z0-9_-]{43}$/.test(signatureRaw)) return null;

  const expected = sign(`${userId}.${movieId}.${expiresAtRaw}`, secret);
  const provided = Buffer.from(signatureRaw, 'base64url');
  // timingSafeEqual throws on a length mismatch. The expected length is
  // fixed (32 bytes) and public, so checking it first leaks nothing.
  if (provided.length !== expected.length) return null;
  // The last base64url character carries 2 unused bits, so 4 strings decode
  // to the same bytes. Only the canonical encoding is accepted.
  if (provided.toString('base64url') !== signatureRaw) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (expiresAt * 1000 <= nowMs) return null;

  return {
    userId: userId.toLowerCase(),
    movieId: movieId.toLowerCase(),
    expiresAt,
    issuedAt: expiresAt - RADAR_LINK_TTL_SECONDS,
  };
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://reelradar.online';
}

// Signed token for one (user, movie), or null when RADAR_LINK_SECRET isn't
// set. Callers drop the remove action instead of failing the whole
// notification, since the booking alert matters more than the shortcut.
export function radarRemoveToken(userId: string, movieId: string): string | null {
  const secret = process.env.RADAR_LINK_SECRET;
  if (!secret) return null;
  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn(`RADAR_LINK_SECRET is shorter than ${MIN_SECRET_LENGTH} characters; remove links are disabled.`);
    return null;
  }
  return createRadarToken(userId, movieId, secret);
}

export function radarRemoveUrl(token: string): string {
  return `${siteUrl()}/radar/remove?t=${encodeURIComponent(token)}`;
}
