import { describe, expect, it } from 'vitest';
import { normalizeTitle } from './normalize';

describe('normalizeTitle', () => {
  it('normalizes "&" and "and" to the same string', () => {
    // Real bug: Scene listed "Above and Below" while TMDB's title is
    // "Above & Below" -- without this, the two never compared equal.
    expect(normalizeTitle('Above & Below')).toBe(normalizeTitle('Above and Below'));
  });

  it('strips format/language suffixes', () => {
    expect(normalizeTitle('Spider-Man: Brand New Day  (2D)')).toBe('spider-man: brand new day');
    expect(normalizeTitle('Toy Story 5 DUB')).toBe('toy story 5');
    expect(normalizeTitle('Moana (3D)')).toBe('moana');
  });
});
