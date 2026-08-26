import { describe, expect, it } from 'vitest';
import { containsSpoilers } from './spoiler-detection';

describe('containsSpoilers', () => {
  it('flags a review that names a plot twist', () => {
    expect(containsSpoilers('I did not see that plot twist coming!')).toBe(true);
  });

  it('flags a review mentioning a character death', () => {
    expect(containsSpoilers('Cannot believe the main character dies at the end.')).toBe(true);
  });

  it('matches word variants via the boundary-matched keyword list', () => {
    expect(containsSpoilers('The ending was incredible.')).toBe(true);
  });

  it('does not match a keyword as a substring of an unrelated word', () => {
    // "end" must not match inside "pretend" -- the whole reason this is
    // word-boundary matched rather than a plain substring test.
    expect(containsSpoilers('I did not pretend to like it, but it was fine.')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(containsSpoilers('MAJOR SPOILER AHEAD')).toBe(true);
  });

  it('returns false for spoiler-free review text', () => {
    expect(containsSpoilers('Great cinematography and a fun cast.')).toBe(false);
  });

  it('matches a multi-word phrase like "turns out"', () => {
    expect(containsSpoilers('It turns out the whole thing was a dream.')).toBe(true);
  });

  it('has the documented false-positive: a review that only disclaims spoilers still matches', () => {
    // This is a keyword heuristic, not real spoiler detection -- expected
    // and documented behavior in spoiler-detection.ts, not a bug.
    expect(containsSpoilers('No spoilers here, just my honest thoughts.')).toBe(true);
  });
});
