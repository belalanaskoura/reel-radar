import { describe, expect, it } from 'vitest';
import { hasEmbeddedRow } from './has-embedded-row';

describe('hasEmbeddedRow', () => {
  it('treats a one-to-one embed with no row (null) as empty', () => {
    expect(hasEmbeddedRow(null)).toBe(false);
  });

  it('treats a one-to-one embed with a row (object) as present', () => {
    expect(hasEmbeddedRow({ movie_id: 'abc' })).toBe(true);
  });

  it('treats a one-to-many embed by its length', () => {
    expect(hasEmbeddedRow([])).toBe(false);
    expect(hasEmbeddedRow([{ movie_id: 'abc' }])).toBe(true);
  });

  it('treats a missing embed as empty', () => {
    expect(hasEmbeddedRow(undefined)).toBe(false);
  });
});
