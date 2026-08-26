import { describe, expect, it } from 'vitest';
import { titleSimilarity } from './title-similarity';

describe('titleSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(titleSimilarity('above and below', 'above and below')).toBe(1);
  });

  it('matches a word-boundary transliteration variant via the space-insensitive fallback', () => {
    // Real bug: "Mahmoud Eltany" (Scene) vs "Mahmoud El Tany" (VOX) -- same
    // name, different word count, so the per-word path never runs.
    expect(titleSimilarity('mahmoud eltany', 'mahmoud el tany')).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects sequels that differ only by digit despite high string similarity', () => {
    expect(titleSimilarity('toy story 5', 'toy story 4')).toBe(0);
  });

  it('rejects unrelated titles', () => {
    expect(titleSimilarity('the odyssey', 'spider man')).toBeLessThan(0.5);
  });
});
