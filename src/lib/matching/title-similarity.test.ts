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

  it('tolerates a single word spelling drift', () => {
    // Real case this exists for: Arabic-title transliteration variants.
    expect(titleSimilarity('khali balak min nafsik', 'khally balak min nafsak')).toBeGreaterThan(
      0.7,
    );
  });

  it('rejects same word count but different digits without a fallback', () => {
    // "The Odyssey" vs "The Odyssey 2" -- different word counts, digits
    // differ, so the space-insensitive fallback must not rescue this.
    expect(titleSimilarity('the odyssey', 'the odyssey 2')).toBe(0);
  });

  it('rejects a word-count mismatch that is not a real transliteration variant', () => {
    // "The Get Out" vs "Get Out" -- word counts differ, but joining words
    // together is not similar enough to clear the 0.9 fallback threshold.
    expect(titleSimilarity('the get out', 'get out')).toBe(0);
  });

  it('returns 0 for an empty first argument', () => {
    expect(titleSimilarity('', 'anything')).toBe(0);
  });

  it('is case-sensitive on raw input (callers are expected to normalize first)', () => {
    expect(titleSimilarity('Above And Below', 'above and below')).toBeLessThan(1);
  });
});
