import { describe, expect, it } from 'vitest';
import { resolveBookable } from './fetcher';
import type { BookabilityResult } from './types';

function result(overrides: Partial<BookabilityResult>): BookabilityResult {
  return { bookable: false, availableDates: [], posterUrl: null, unconfirmed: false, ...overrides };
}

describe('resolveBookable', () => {
  it('is bookable on a confirmed check regardless of previous state', () => {
    const r = result({ bookable: true, availableDates: ['02-10-2026'] });
    expect(resolveBookable(r, false)).toBe(true);
    expect(resolveBookable(r, true)).toBe(true);
  });

  it('keeps an already-bookable movie bookable on an unconfirmed check', () => {
    const r = result({ availableDates: ['02-10-2026'], unconfirmed: true });
    expect(resolveBookable(r, true)).toBe(true);
  });

  it('does not make a not-yet-bookable movie bookable on an unconfirmed check', () => {
    const r = result({ availableDates: ['02-10-2026'], unconfirmed: true });
    expect(resolveBookable(r, false)).toBe(false);
  });

  it('treats an empty calendar as a real transition to not bookable', () => {
    expect(resolveBookable(result({}), true)).toBe(false);
  });
});
