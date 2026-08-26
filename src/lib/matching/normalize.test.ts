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

  it('strips 4DX/IMAX/VIP and ARABIC/ENGLISH/DUBBING tags', () => {
    expect(normalizeTitle('Avatar 3 (4DX)')).toBe('avatar 3');
    expect(normalizeTitle('Avatar 3 (IMAX)')).toBe('avatar 3');
    expect(normalizeTitle('Avatar 3 (VIP)')).toBe('avatar 3');
    expect(normalizeTitle('Some Movie ARABIC')).toBe('some movie');
    expect(normalizeTitle('Some Movie DUBBING')).toBe('some movie');
  });

  it('collapses repeated whitespace left behind by stripped tags', () => {
    expect(normalizeTitle('Moana   (3D)   DUB')).toBe('moana');
  });

  it('lowercases the result', () => {
    expect(normalizeTitle('THE ODYSSEY')).toBe('the odyssey');
  });

  it('is idempotent', () => {
    const once = normalizeTitle('Toy Story 5 (2D) DUB');
    expect(normalizeTitle(once)).toBe(once);
  });
});
