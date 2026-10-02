import { describe, expect, it } from 'vitest';
import {
  REMINDER_COOLDOWN_MS,
  REMINDER_STALE_CACHE_MS,
  bookableBranchesFor,
  cairoHour,
  isReminderDue,
  isWithinReminderHours,
  reminderCutoff,
  alertKey,
  selectDueReminders,
  type ReminderCacheRow,
  type ReminderProfile,
  type ReminderWatchRow,
} from './reminders';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function ago(ms: number): string {
  return iso(NOW.getTime() - ms);
}

function cache(overrides: Partial<ReminderCacheRow>): ReminderCacheRow {
  return { movie_id: 'm1', branch_id: 'cfc', bookable: true, last_checked_at: ago(HOUR), ...overrides };
}

function profile(overrides: Partial<ReminderProfile>): ReminderProfile {
  return {
    id: 'u1',
    email: 'u1@example.com',
    notify_cinema_showtimes: true,
    notify_showtime_reminders: true,
    subscribed_branch_ids: null,
    ...overrides,
  };
}

function watch(overrides: Partial<ReminderWatchRow>): ReminderWatchRow {
  return { user_id: 'u1', movie_id: 'm1', last_bookable_alert_at: ago(25 * HOUR), ...overrides };
}

describe('reminderCutoff', () => {
  it('is exactly 24h before now', () => {
    expect(REMINDER_COOLDOWN_MS).toBe(24 * HOUR);
    expect(reminderCutoff(NOW).toISOString()).toBe('2026-07-14T12:00:00.000Z');
  });

  it('does not mutate the input date', () => {
    const now = new Date(NOW.getTime());
    reminderCutoff(now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});

describe('isReminderDue', () => {
  it('is due at exactly 24h since the last alert', () => {
    expect(isReminderDue(ago(24 * HOUR), NOW)).toBe(true);
  });

  it('is not due 1ms short of 24h', () => {
    expect(isReminderDue(ago(24 * HOUR - 1), NOW)).toBe(false);
  });

  it('is due well past 24h', () => {
    expect(isReminderDue(ago(72 * HOUR), NOW)).toBe(true);
  });

  it('is not due for a fresh alert or one in the future', () => {
    expect(isReminderDue(ago(0), NOW)).toBe(false);
    expect(isReminderDue(iso(NOW.getTime() + HOUR), NOW)).toBe(false);
  });

  it('is not due when there was never a first alert', () => {
    expect(isReminderDue(null, NOW)).toBe(false);
    expect(isReminderDue('', NOW)).toBe(false);
  });

  it('is not due for an unparseable timestamp', () => {
    expect(isReminderDue('not a date', NOW)).toBe(false);
  });

  it('accepts the Postgres timestamptz format PostgREST returns', () => {
    expect(isReminderDue('2026-07-14 12:00:00+00', NOW)).toBe(true);
    expect(isReminderDue('2026-07-14T12:00:00.001+00:00', NOW)).toBe(false);
  });
});

describe('isWithinReminderHours', () => {
  // Africa/Cairo is UTC+3 during Egypt's 2026 summer time (late April to
  // late October) and UTC+2 otherwise. Checked against Intl below so the
  // offsets used here are not just assumed.
  it('uses the offsets these tests assume', () => {
    expect(cairoHour(new Date('2026-07-15T07:00:00Z'))).toBe(10);
    expect(cairoHour(new Date('2026-01-15T08:00:00Z'))).toBe(10);
  });

  it('opens at 10:00 and closes at 22:00 Cairo in summer (UTC+3)', () => {
    expect(isWithinReminderHours(new Date('2026-07-15T06:59:00Z'))).toBe(false); // 09:59
    expect(isWithinReminderHours(new Date('2026-07-15T07:00:00Z'))).toBe(true); // 10:00
    expect(isWithinReminderHours(new Date('2026-07-15T18:59:00Z'))).toBe(true); // 21:59
    expect(isWithinReminderHours(new Date('2026-07-15T19:00:00Z'))).toBe(false); // 22:00
  });

  it('opens at 10:00 and closes at 22:00 Cairo in winter (UTC+2)', () => {
    expect(isWithinReminderHours(new Date('2026-01-15T07:59:00Z'))).toBe(false); // 09:59
    expect(isWithinReminderHours(new Date('2026-01-15T08:00:00Z'))).toBe(true); // 10:00
    expect(isWithinReminderHours(new Date('2026-01-15T19:59:00Z'))).toBe(true); // 21:59
    expect(isWithinReminderHours(new Date('2026-01-15T20:00:00Z'))).toBe(false); // 22:00
  });

  it('treats 09:59:59.999 as outside and 21:59:59.999 as inside', () => {
    expect(isWithinReminderHours(new Date('2026-07-15T06:59:59.999Z'))).toBe(false);
    expect(isWithinReminderHours(new Date('2026-07-15T18:59:59.999Z'))).toBe(true);
  });

  it('reports Cairo midnight as hour 0, not 24', () => {
    const midnight = new Date('2026-07-14T21:00:00Z');
    expect(cairoHour(midnight)).toBe(0);
    expect(isWithinReminderHours(midnight)).toBe(false);
  });

  it('follows the October 2026 switch back to UTC+2', () => {
    // 07:30 UTC is 10:30 Cairo on Oct 29 (still UTC+3) but 09:30 on Oct 30.
    expect(isWithinReminderHours(new Date('2026-10-29T07:30:00Z'))).toBe(true);
    expect(isWithinReminderHours(new Date('2026-10-30T07:30:00Z'))).toBe(false);
  });
});

describe('bookableBranchesFor', () => {
  it('returns nothing when the movie is not bookable anywhere', () => {
    const rows = [cache({ bookable: false }), cache({ branch_id: 'district5', bookable: false })];
    expect(bookableBranchesFor('m1', rows, null, NOW)).toEqual([]);
  });

  it('drops rows checked more than 36h ago and keeps one checked exactly 36h ago', () => {
    expect(REMINDER_STALE_CACHE_MS).toBe(36 * HOUR);
    const rows = [
      cache({ branch_id: 'cfc', last_checked_at: ago(36 * HOUR + 1) }),
      cache({ branch_id: 'district5', last_checked_at: ago(36 * HOUR) }),
    ];
    expect(bookableBranchesFor('m1', rows, null, NOW)).toEqual(['district5']);
  });

  it('drops rows with a null or unparseable last_checked_at', () => {
    const rows = [
      cache({ branch_id: 'cfc', last_checked_at: null }),
      cache({ branch_id: 'district5', last_checked_at: 'garbage' }),
    ];
    expect(bookableBranchesFor('m1', rows, null, NOW)).toEqual([]);
  });

  it('treats null subscribed_branch_ids as every branch', () => {
    const rows = [cache({ branch_id: 'vox-moe' }), cache({ branch_id: 'cfc' })];
    expect(bookableBranchesFor('m1', rows, null, NOW)).toEqual(['cfc', 'vox-moe']);
  });

  it('keeps only subscribed branches when the list is set', () => {
    const rows = [cache({ branch_id: 'cfc' }), cache({ branch_id: 'district5' }), cache({ branch_id: 'vox-moe' })];
    expect(bookableBranchesFor('m1', rows, ['district5', 'vox-moe'], NOW)).toEqual(['district5', 'vox-moe']);
  });

  it('returns nothing for an empty subscription list', () => {
    expect(bookableBranchesFor('m1', [cache({})], [], NOW)).toEqual([]);
  });

  it('collapses duplicate rows for the same branch', () => {
    const rows = [cache({ branch_id: 'cfc' }), cache({ branch_id: 'cfc', last_checked_at: ago(2 * HOUR) })];
    expect(bookableBranchesFor('m1', rows, null, NOW)).toEqual(['cfc']);
  });

  it('ignores rows for other movies', () => {
    const rows = [cache({ movie_id: 'm2', branch_id: 'cfc' }), cache({ movie_id: 'm1', branch_id: 'district5' })];
    expect(bookableBranchesFor('m1', rows, null, NOW)).toEqual(['district5']);
  });
});

// Most cases below are about the other rules, so mark every watched
// (user, movie) as alerted at every branch in the cache rows.
function selectAllAlerted(input: Omit<Parameters<typeof selectDueReminders>[0], 'alertedBranches'>) {
  const alertedBranches = new Set<string>();
  for (const w of input.watchRows) {
    for (const c of input.cacheRows) alertedBranches.add(alertKey(w.user_id, w.movie_id, c.branch_id));
  }
  return selectDueReminders({ ...input, alertedBranches });
}

describe('selectDueReminders', () => {
  const threeBranches = [
    cache({ branch_id: 'district5' }),
    cache({ branch_id: 'cfc' }),
    cache({ branch_id: 'vox-moe' }),
  ];

  it('gives one entry covering all three bookable branches', () => {
    const due = selectAllAlerted({
      watchRows: [watch({})],
      cacheRows: threeBranches,
      profiles: [profile({})],
      now: NOW,
    });
    expect(due).toHaveLength(1);
    expect(due[0]).toEqual({
      userId: 'u1',
      movieId: 'm1',
      email: 'u1@example.com',
      branchIds: ['cfc', 'district5', 'vox-moe'],
      lastAlertAt: ago(25 * HOUR),
    });
  });

  it('collapses duplicate watch rows for the same user and movie', () => {
    const due = selectAllAlerted({
      watchRows: [watch({}), watch({}), watch({ last_bookable_alert_at: ago(30 * HOUR) })],
      cacheRows: threeBranches,
      profiles: [profile({})],
      now: NOW,
    });
    expect(due).toHaveLength(1);
  });

  it('skips rows that are not due yet or never got a first alert', () => {
    const due = selectAllAlerted({
      watchRows: [
        watch({ user_id: 'u1', last_bookable_alert_at: ago(24 * HOUR - 1) }),
        watch({ user_id: 'u2', last_bookable_alert_at: null }),
      ],
      cacheRows: threeBranches,
      profiles: [profile({ id: 'u1' }), profile({ id: 'u2', email: 'u2@example.com' })],
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('respects the main switch and the reminder switch', () => {
    const due = selectAllAlerted({
      watchRows: [watch({ user_id: 'off-main' }), watch({ user_id: 'off-reminders' }), watch({ user_id: 'null-flags' })],
      cacheRows: threeBranches,
      profiles: [
        profile({ id: 'off-main', notify_cinema_showtimes: false }),
        profile({ id: 'off-reminders', notify_showtime_reminders: false }),
        profile({ id: 'null-flags', notify_cinema_showtimes: null, notify_showtime_reminders: null }),
      ],
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('skips users with no email or no profile', () => {
    const due = selectAllAlerted({
      watchRows: [watch({ user_id: 'no-email' }), watch({ user_id: 'no-profile' })],
      cacheRows: threeBranches,
      profiles: [profile({ id: 'no-email', email: null })],
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('excludes a movie that is no longer bookable or only has stale cache rows', () => {
    const due = selectAllAlerted({
      watchRows: [watch({ movie_id: 'ended' }), watch({ movie_id: 'stale' })],
      cacheRows: [
        cache({ movie_id: 'ended', bookable: false }),
        cache({ movie_id: 'stale', last_checked_at: ago(37 * HOUR) }),
      ],
      profiles: [profile({})],
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('excludes a movie bookable only at branches the user does not follow', () => {
    const due = selectAllAlerted({
      watchRows: [watch({})],
      cacheRows: [cache({ branch_id: 'cfc' })],
      profiles: [profile({ subscribed_branch_ids: ['district5'] })],
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('lists only subscribed branches for a user with a branch filter', () => {
    const due = selectAllAlerted({
      watchRows: [watch({})],
      cacheRows: threeBranches,
      profiles: [profile({ subscribed_branch_ids: ['cfc', 'vox-moe'] })],
      now: NOW,
    });
    expect(due.map((d) => d.branchIds)).toEqual([['cfc', 'vox-moe']]);
  });

  it('orders the oldest alert first', () => {
    const due = selectAllAlerted({
      watchRows: [
        watch({ user_id: 'u1', movie_id: 'm1', last_bookable_alert_at: ago(25 * HOUR) }),
        watch({ user_id: 'u1', movie_id: 'm2', last_bookable_alert_at: ago(48 * HOUR) }),
        watch({ user_id: 'u2', movie_id: 'm1', last_bookable_alert_at: ago(30 * HOUR) }),
      ],
      cacheRows: [cache({ movie_id: 'm1' }), cache({ movie_id: 'm2' })],
      profiles: [profile({ id: 'u1' }), profile({ id: 'u2', email: 'u2@example.com' })],
      now: NOW,
    });
    expect(due.map((d) => `${d.userId}:${d.movieId}`)).toEqual(['u1:m2', 'u2:m1', 'u1:m1']);
  });

  it('gives separate entries per movie for the same user', () => {
    const due = selectAllAlerted({
      watchRows: [watch({ movie_id: 'm1' }), watch({ movie_id: 'm2' })],
      cacheRows: [cache({ movie_id: 'm1' }), cache({ movie_id: 'm2', branch_id: 'district5' })],
      profiles: [profile({})],
      now: NOW,
    });
    expect(due).toHaveLength(2);
  });

  it('becomes not due again once the claim moves the timestamp to now', () => {
    // Mirrors the route's compare and swap: after a send, the stored
    // timestamp is the send time, so the next run 30 minutes later
    // finds nothing due for this pair.
    const later = new Date(NOW.getTime() + 30 * 60 * 1000);
    const due = selectAllAlerted({
      watchRows: [watch({ last_bookable_alert_at: NOW.toISOString() })],
      cacheRows: threeBranches.map((r) => ({ ...r, last_checked_at: later.toISOString() })),
      profiles: [profile({})],
      now: later,
    });
    expect(due).toEqual([]);
  });

  it('returns an empty list for empty inputs', () => {
    expect(selectAllAlerted({ watchRows: [], cacheRows: [], profiles: [], now: NOW })).toEqual([]);
  });

  it('only lists branches the user got the first alert for', () => {
    const due = selectDueReminders({
      watchRows: [watch({})],
      cacheRows: threeBranches,
      profiles: [profile({})],
      alertedBranches: new Set([alertKey('u1', 'm1', 'cfc'), alertKey('u1', 'm1', 'vox-moe')]),
      now: NOW,
    });
    expect(due.map((d) => d.branchIds)).toEqual([['cfc', 'vox-moe']]);
  });

  it('sends nothing for a re-opened movie until poll sends the new first alert', () => {
    // The old run's timestamp is days old, but poll cleared the log when
    // the movie stopped being bookable and hasn't alerted again yet.
    const due = selectDueReminders({
      watchRows: [watch({ last_bookable_alert_at: ago(5 * 24 * HOUR) })],
      cacheRows: threeBranches,
      profiles: [profile({})],
      alertedBranches: new Set(),
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('ignores alert keys that belong to another user', () => {
    const due = selectDueReminders({
      watchRows: [watch({ user_id: 'u1' })],
      cacheRows: threeBranches,
      profiles: [profile({ id: 'u1' })],
      alertedBranches: new Set([alertKey('u2', 'm1', 'cfc')]),
      now: NOW,
    });
    expect(due).toEqual([]);
  });
});
