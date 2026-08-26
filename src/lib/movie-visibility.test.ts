import { afterEach, describe, expect, it, vi } from 'vitest';
import { hidePosterlessMovies } from './movie-visibility';

// hidePosterlessMovies compares against toISOString() (UTC), so the fake
// system time here is set at UTC noon specifically -- far enough from
// midnight that no real-world runner timezone can push the local wall
// clock across a UTC day boundary and make these flaky.
describe('hidePosterlessMovies', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true before the expiry date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(hidePosterlessMovies()).toBe(true);
  });

  it('returns false on the expiry date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    expect(hidePosterlessMovies()).toBe(false);
  });

  it('returns false after the expiry date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    expect(hidePosterlessMovies()).toBe(false);
  });
});
