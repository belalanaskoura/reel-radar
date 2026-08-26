import { describe, expect, it } from 'vitest';
import { findTemplateRowForFormat, matchPriceForCategory, type ScenePriceTemplateRow } from './price-template';

const TEMPLATE: ScenePriceTemplateRow[] = [
  { branchId: 'cfc', format: 'Standard', priceEgp: 100, verifiedAt: '2026-01-01' },
  { branchId: 'cfc', format: 'VIP', priceEgp: 200, verifiedAt: '2026-01-01' },
  { branchId: 'district5', format: 'Standard & Deluxe', priceEgp: 150, verifiedAt: '2026-01-01' },
];

describe('findTemplateRowForFormat', () => {
  it('finds an exact case-insensitive match', () => {
    expect(findTemplateRowForFormat(TEMPLATE, 'cfc', 'standard')?.priceEgp).toBe(100);
  });

  it('matches a seat category that is a substring of a combined format row', () => {
    // Real case this exists for: District 5 lists "Standard & Deluxe" as
    // one showtime-level format, but individual seat categories are just
    // "Standard" or "Deluxe".
    expect(findTemplateRowForFormat(TEMPLATE, 'district5', 'Standard')?.priceEgp).toBe(150);
    expect(findTemplateRowForFormat(TEMPLATE, 'district5', 'Deluxe')?.priceEgp).toBe(150);
  });

  it('matches in the other direction, a combined format against a plain template row', () => {
    expect(findTemplateRowForFormat(TEMPLATE, 'cfc', 'Standard & Deluxe')?.priceEgp).toBe(100);
  });

  it('only searches rows for the given branch', () => {
    expect(findTemplateRowForFormat(TEMPLATE, 'district5', 'VIP')).toBeNull();
  });

  it('returns null for an empty format string', () => {
    expect(findTemplateRowForFormat(TEMPLATE, 'cfc', '   ')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findTemplateRowForFormat(TEMPLATE, 'cfc', 'IMAX')).toBeNull();
  });

  it('prefers an exact match over a partial one when both are available', () => {
    const template: ScenePriceTemplateRow[] = [
      { branchId: 'cfc', format: 'Standard', priceEgp: 100, verifiedAt: '2026-01-01' },
      { branchId: 'cfc', format: 'Standard Extra', priceEgp: 999, verifiedAt: '2026-01-01' },
    ];
    expect(findTemplateRowForFormat(template, 'cfc', 'Standard')?.priceEgp).toBe(100);
  });
});

describe('matchPriceForCategory', () => {
  it('returns the matched price', () => {
    expect(matchPriceForCategory(TEMPLATE, 'cfc', 'VIP')).toBe(200);
  });

  it('returns null when there is no match', () => {
    expect(matchPriceForCategory(TEMPLATE, 'cfc', 'IMAX')).toBeNull();
  });
});
