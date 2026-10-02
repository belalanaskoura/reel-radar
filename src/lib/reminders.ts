// Eligibility rules for the daily "still on your radar" reminder sent by
// /api/send-reminders. Pure functions only, so the cooldown and
// quiet-hours math can be tested without a database.

// Strict rolling window, not a calendar day: a reminder never goes out
// sooner than 24h after the user's previous bookable alert or reminder
// for the same movie.
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// A bookable flag nobody has re-checked for this long is treated as
// unknown rather than true, so a stalled scraper can't keep reminding
// people about showtimes that may be gone.
export const REMINDER_STALE_CACHE_MS = 36 * 60 * 60 * 1000;

// Reminders only go out between these Cairo hours (start inclusive, end
// exclusive). One that comes due overnight waits for the morning, which
// still respects the 24h minimum since it only ever moves later.
export const REMINDER_HOURS_CAIRO = { start: 10, end: 22 } as const;

export function cairoHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  // Some ICU versions render midnight as "24".
  return Number(hour) % 24;
}

export function isWithinReminderHours(now: Date): boolean {
  const hour = cairoHour(now);
  return hour >= REMINDER_HOURS_CAIRO.start && hour < REMINDER_HOURS_CAIRO.end;
}

// Latest last_bookable_alert_at that's old enough for another reminder.
export function reminderCutoff(now: Date): Date {
  return new Date(now.getTime() - REMINDER_COOLDOWN_MS);
}

export function isReminderDue(lastAlertAt: string | null, now: Date): boolean {
  // Null means this user never got the first bookable alert for this
  // movie, so there's nothing to remind them about yet.
  if (!lastAlertAt) return false;
  const last = Date.parse(lastAlertAt);
  if (Number.isNaN(last)) return false;
  return last <= reminderCutoff(now).getTime();
}

export interface ReminderWatchRow {
  user_id: string;
  movie_id: string;
  last_bookable_alert_at: string | null;
}

export interface ReminderCacheRow {
  movie_id: string;
  branch_id: string;
  bookable: boolean;
  last_checked_at: string | null;
}

export interface ReminderProfile {
  id: string;
  email: string | null;
  notify_cinema_showtimes: boolean | null;
  notify_showtime_reminders: boolean | null;
  subscribed_branch_ids: string[] | null;
}

// Key for a (user, movie, branch) that has a notification_log 'showtime'
// row. /api/poll clears those rows whenever it sees the pair not
// bookable, so a key existing means the user got the first alert for the
// current bookable stretch at that branch.
export function alertKey(userId: string, movieId: string, branchId: string): string {
  return `${userId}:${movieId}:${branchId}`;
}

export interface DueReminder {
  userId: string;
  movieId: string;
  email: string;
  // Every branch the movie is bookable at right now that this user gets
  // alerts for. One reminder covers all of them.
  branchIds: string[];
  lastAlertAt: string;
}

export function bookableBranchesFor(
  movieId: string,
  cacheRows: ReminderCacheRow[],
  subscribedBranchIds: string[] | null,
  now: Date,
): string[] {
  const branchIds = new Set<string>();
  for (const row of cacheRows) {
    if (row.movie_id !== movieId || !row.bookable) continue;
    if (!row.last_checked_at) continue;
    const checked = Date.parse(row.last_checked_at);
    if (Number.isNaN(checked) || now.getTime() - checked > REMINDER_STALE_CACHE_MS) continue;
    // null means "every branch", same as /api/poll's initial alert.
    if (subscribedBranchIds && !subscribedBranchIds.includes(row.branch_id)) continue;
    branchIds.add(row.branch_id);
  }
  return [...branchIds].sort();
}

// One entry per (user, movie) that should get a reminder now, oldest
// alert first so a capped run serves whoever has waited longest.
//
// alertedBranches (see alertKey) limits each reminder to branches the
// user was actually alerted about this time around. Without it, a movie
// that ended and then re-opened could send "still bookable" before poll
// got round to the new "now bookable" alert, since last_bookable_alert_at
// still holds the old run's timestamp.
export function selectDueReminders({
  watchRows,
  cacheRows,
  profiles,
  alertedBranches,
  now,
}: {
  watchRows: ReminderWatchRow[];
  cacheRows: ReminderCacheRow[];
  profiles: ReminderProfile[];
  alertedBranches: Set<string>;
  now: Date;
}): DueReminder[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const due: DueReminder[] = [];

  for (const row of watchRows) {
    const key = `${row.user_id}:${row.movie_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!isReminderDue(row.last_bookable_alert_at, now)) continue;

    const profile = profileById.get(row.user_id);
    if (!profile?.email) continue;
    // The main showtime-alerts switch turns reminders off too; the
    // reminder switch only turns off reminders.
    if (!profile.notify_cinema_showtimes || !profile.notify_showtime_reminders) continue;

    const branchIds = bookableBranchesFor(row.movie_id, cacheRows, profile.subscribed_branch_ids, now).filter(
      (branchId) => alertedBranches.has(alertKey(row.user_id, row.movie_id, branchId)),
    );
    if (branchIds.length === 0) continue;

    due.push({
      userId: row.user_id,
      movieId: row.movie_id,
      email: profile.email,
      branchIds,
      lastAlertAt: row.last_bookable_alert_at as string,
    });
  }

  return due.sort((a, b) => Date.parse(a.lastAlertAt) - Date.parse(b.lastAlertAt));
}
