import { describe, expect, it } from 'vitest';
import {
  filterFutureDates,
  filterFutureIsoDates,
  isValidSceneSlug,
  isValidShowtimeDate,
  parseElCinemaTimeToMinutes,
} from './dates';

describe('isValidShowtimeDate', () => {
  it('accepts DD-MM-YYYY', () => {
    expect(isValidShowtimeDate('24-10-2026')).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isValidShowtimeDate('2026-10-24')).toBe(false);
    expect(isValidShowtimeDate('not-a-date')).toBe(false);
  });
});

describe('isValidSceneSlug', () => {
  it('accepts lowercase hyphenated slugs', () => {
    expect(isValidSceneSlug('toy-story-5-2d')).toBe(true);
  });

  it('rejects a query-string injection attempt', () => {
    expect(isValidSceneSlug('toy-story?business_day=1')).toBe(false);
  });

  it('rejects a slug over the length cap', () => {
    expect(isValidSceneSlug('a'.repeat(121))).toBe(false);
  });
});

describe('parseElCinemaTimeToMinutes', () => {
  it('treats "12:00 midnight" as the start of the day, not noon', () => {
    expect(parseElCinemaTimeToMinutes('12:00 midnight')).toBe(0);
  });

  it('treats "12:30 midnight" as just after midnight', () => {
    expect(parseElCinemaTimeToMinutes('12:30 midnight')).toBe(30);
  });

  it('parses standard 12-hour times', () => {
    expect(parseElCinemaTimeToMinutes('11:45 am')).toBe(11 * 60 + 45);
    expect(parseElCinemaTimeToMinutes('12:30 pm')).toBe(12 * 60 + 30);
  });

  it('returns null for an unrecognized shape', () => {
    expect(parseElCinemaTimeToMinutes('garbage')).toBeNull();
  });
});

describe('filterFutureDates', () => {
  it('drops past dates and keeps future ones', () => {
    expect(filterFutureDates(['01-01-2020', '01-01-2099'])).toEqual(['01-01-2099']);
  });
});

describe('filterFutureIsoDates', () => {
  it('drops past dates and keeps future ones', () => {
    expect(filterFutureIsoDates(['2020-01-01', '2099-01-01'])).toEqual(['2099-01-01']);
  });
});
