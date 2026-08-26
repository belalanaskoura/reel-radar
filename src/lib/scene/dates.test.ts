import { describe, expect, it, vi } from 'vitest';
import {
  filterFutureDates,
  filterFutureIsoDates,
  filterPastVoxShowtimes,
  formatIsoDateLabel,
  formatSceneDateLabel,
  isValidSceneSlug,
  isValidShowtimeDate,
  parseElCinemaTimeToMinutes,
  parseIsoDate,
  parseSceneDate,
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

describe('parseSceneDate', () => {
  it('parses DD-MM-YYYY into the correct calendar date', () => {
    const parsed = parseSceneDate('24-10-2026');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9); // October, 0-indexed
    expect(parsed.getDate()).toBe(24);
  });
});

describe('parseIsoDate', () => {
  it('parses YYYY-MM-DD into the correct calendar date', () => {
    const parsed = parseIsoDate('2026-10-24');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9);
    expect(parsed.getDate()).toBe(24);
  });
});

describe('formatSceneDateLabel', () => {
  it('formats a valid DD-MM-YYYY date as a short weekday label', () => {
    expect(formatSceneDateLabel('24-10-2026')).toBe('Sat, Oct 24');
  });

  it('falls through to Invalid Date for a shape the split-based guard cannot catch', () => {
    // The guard only checks that day/month/year are non-empty after
    // splitting on '-', so a 3-hyphen-part non-numeric string like
    // "not-a-date" passes it and reaches Date's own parsing instead.
    expect(formatSceneDateLabel('not-a-date')).toBe('Invalid Date');
  });

  it('returns the original string unchanged when a part is missing entirely', () => {
    expect(formatSceneDateLabel('24-10')).toBe('24-10');
  });
});

describe('formatIsoDateLabel', () => {
  it('formats a valid YYYY-MM-DD date as a short weekday label', () => {
    expect(formatIsoDateLabel('2026-10-24')).toBe('Sat, Oct 24');
  });

  it('returns the original string unchanged when a part is missing entirely', () => {
    expect(formatIsoDateLabel('2026-10')).toBe('2026-10');
  });
});

describe('filterPastVoxShowtimes', () => {
  it('keeps every showtime for a date other than today, regardless of time', () => {
    const showtimes = [{ time: '12:00 midnight' }, { time: '11:45 am' }];
    expect(filterPastVoxShowtimes('2020-01-01', showtimes)).toEqual(showtimes);
  });

  it('drops only showtimes earlier than the current time when the date is today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 14, 0)); // 2:00 PM local time

    const showtimes = [{ time: '11:45 am' }, { time: '3:30 pm' }];
    expect(filterPastVoxShowtimes('2026-10-24', showtimes)).toEqual([{ time: '3:30 pm' }]);

    vi.useRealTimers();
  });

  it('keeps a showtime with an unparseable time rather than dropping it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 14, 0));

    expect(filterPastVoxShowtimes('2026-10-24', [{ time: 'garbage' }])).toEqual([
      { time: 'garbage' },
    ]);

    vi.useRealTimers();
  });
});
