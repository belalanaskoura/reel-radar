import { describe, expect, it } from 'vitest';
import { isRecentOrUpcoming } from './recency';

describe('isRecentOrUpcoming', () => {
  it('accepts a release date from today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isRecentOrUpcoming(today)).toBe(true);
  });

  it('accepts a future release date', () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    expect(isRecentOrUpcoming(nextYear.toISOString().slice(0, 10))).toBe(true);
  });

  it('accepts a release date within the last 2 years', () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    expect(isRecentOrUpcoming(oneYearAgo.toISOString().slice(0, 10))).toBe(true);
  });

  it('rejects a decades-old release date', () => {
    // The real case this guards against: TMDB's "Resident Evil" (2002)
    // sharing an exact title with the real 2026 reboot.
    expect(isRecentOrUpcoming('2002-03-15')).toBe(false);
  });

  it('rejects an empty release date', () => {
    expect(isRecentOrUpcoming('')).toBe(false);
  });

  it('rejects an unparseable release date', () => {
    expect(isRecentOrUpcoming('not-a-date')).toBe(false);
  });
});
