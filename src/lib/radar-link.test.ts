import { describe, expect, it } from 'vitest';
import { createRadarToken, verifyRadarToken, MIN_SECRET_LENGTH, RADAR_LINK_TTL_SECONDS } from './radar-link';

const SECRET = 'test-secret-value-that-is-long-enough-123';
const USER = '11111111-2222-3333-4444-555555555555';
const OTHER_USER = '99999999-2222-3333-4444-555555555555';
const MOVIE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

describe('radar remove tokens', () => {
  it('round-trips the user and movie it was minted for', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    expect(verifyRadarToken(token, SECRET, NOW)).toEqual({
      userId: USER,
      movieId: MOVIE,
      expiresAt: Math.floor(NOW / 1000) + RADAR_LINK_TTL_SECONDS,
      issuedAt: Math.floor(NOW / 1000),
    });
  });

  it('rejects a token whose user id was swapped', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    const forged = token.replace(USER, OTHER_USER);
    expect(verifyRadarToken(forged, SECRET, NOW)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = createRadarToken(USER, MOVIE, 'some-other-secret-that-is-also-long-enough', NOW);
    expect(verifyRadarToken(token, SECRET, NOW)).toBeNull();
  });

  it('rejects a pushed-out expiry', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    const [u, m, exp, sig] = token.split('.');
    expect(verifyRadarToken([u, m, String(Number(exp) + 1000), sig].join('.'), SECRET, NOW)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    const later = NOW + (RADAR_LINK_TTL_SECONDS + 1) * 1000;
    expect(verifyRadarToken(token, SECRET, later)).toBeNull();
  });

  it('fails closed with no secret configured', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    expect(verifyRadarToken(token, undefined, NOW)).toBeNull();
    expect(verifyRadarToken(token, '', NOW)).toBeNull();
  });

  it('treats a secret shorter than the minimum as unset', () => {
    const short = 'x'.repeat(MIN_SECRET_LENGTH - 1);
    const token = createRadarToken(USER, MOVIE, short, NOW);
    expect(verifyRadarToken(token, short, NOW)).toBeNull();
  });

  it('accepts only the canonical encoding of the signature', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const accepted = [...alphabet].filter((c) =>
      verifyRadarToken(`${token.slice(0, -1)}${c}`, SECRET, NOW),
    );
    expect(accepted).toEqual([token.slice(-1)]);
  });

  it('rejects a repeated query param that arrives as an array', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    expect(verifyRadarToken([token, token] as unknown as string, SECRET, NOW)).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    const token = createRadarToken(USER, MOVIE, SECRET, NOW);
    for (const bad of [null, undefined, '', 'a.b.c', `${token}.extra`, `${token}!`, `${token.slice(0, -1)}`]) {
      expect(verifyRadarToken(bad, SECRET, NOW)).toBeNull();
    }
  });
});
