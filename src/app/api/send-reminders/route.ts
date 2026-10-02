import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { notifyShowtimeReminderByEmail } from '@/lib/email';
import { notifyShowtimeReminderPush } from '@/lib/push';
import { BRANCH_BASE_URLS, type BranchId as SceneBranchId } from '@/lib/scene/types';
import { chainForBranch, voxBranchShowtimesUrl, type VoxBranchId } from '@/lib/branches';
import { mapWithConcurrency } from '@/lib/concurrency';
import { logEvent } from '@/lib/analytics';
import { logError } from '@/lib/logger';
import { radarRemoveToken, siteUrl } from '@/lib/radar-link';
import {
  REMINDER_STALE_CACHE_MS,
  alertKey,
  isWithinReminderHours,
  reminderCutoff,
  selectDueReminders,
  type DueReminder,
  type ReminderCacheRow,
  type ReminderProfile,
  type ReminderWatchRow,
} from '@/lib/reminders';

export const maxDuration = 60;

const NOTIFY_CONCURRENCY = 10;

// Upper bound per call. Anything left over is still due on the next run
// 30 minutes later, oldest first, so nobody is skipped for good.
const MAX_PER_RUN = 100;

// Stop starting new sends after this long so the whole request stays
// under cron-job.org's 30s timeout. Sends already in flight finish (each
// channel has its own 15s timeout, so this leaves room for a slow one);
// the rest stay unclaimed and go out next run.
const SEND_BUDGET_MS = 12_000;

type SendOutcome = 'sent' | 'skipped' | 'deferred';

type ResolvedReminder = DueReminder & {
  movieTitle: string;
  reminderBranches: { name: string; bookingUrl: string }[];
};

// Daily "still on your radar" reminder. Separate from /api/poll so poll's
// per-batch time budget is untouched, and called on its own cron-job.org
// schedule (every 30 minutes, x-sync-secret header, POST).
//
// Dedupe is a compare-and-swap on watchlist.last_bookable_alert_at: a
// send is claimed by moving that timestamp to now, but only if it's still
// older than the 24h cutoff. Two overlapping runs both see the row as due,
// but Postgres applies the two updates one after the other and the second
// one's WHERE no longer matches, so only one of them sends. Claiming
// before sending means a failed send skips that day's reminder rather
// than risking two.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date(startedAt);

  if (!isWithinReminderHours(now)) {
    return NextResponse.json({ due: 0, sent: 0, skipped: 'quiet_hours' });
  }

  const supabase = createServiceRoleClient();
  const cutoffIso = reminderCutoff(now).toISOString();

  try {
    // Start from what's bookable right now (and recently checked), so the
    // watchlist read only covers movies that could need a reminder. Rows
    // for movies whose run ended keep an old timestamp forever and would
    // otherwise make this query grow without bound.
    const staleCutoffIso = new Date(startedAt - REMINDER_STALE_CACHE_MS).toISOString();
    const { data: cacheRows, error: cacheError } = await supabase
      .from('showtimes_cache')
      .select('movie_id, branch_id, bookable, last_checked_at')
      .eq('bookable', true)
      .gte('last_checked_at', staleCutoffIso);
    if (cacheError) throw new Error(cacheError.message);
    const bookableMovieIds = [...new Set((cacheRows ?? []).map((r) => r.movie_id as string))];
    if (bookableMovieIds.length === 0) {
      return NextResponse.json({ due: 0, sent: 0 });
    }

    // lte excludes nulls, so rows that never got a first alert drop out
    // here already.
    const { data: watchRows, error: watchError } = await supabase
      .from('watchlist')
      .select('user_id, movie_id, last_bookable_alert_at')
      .in('movie_id', bookableMovieIds)
      .lte('last_bookable_alert_at', cutoffIso)
      .order('last_bookable_alert_at', { ascending: true });
    if (watchError) throw new Error(watchError.message);
    if (!watchRows || watchRows.length === 0) {
      return NextResponse.json({ due: 0, sent: 0 });
    }

    const movieIds = [...new Set(watchRows.map((r) => r.movie_id as string))];
    const userIds = [...new Set(watchRows.map((r) => r.user_id as string))];

    const [{ data: profiles, error: profileError }, { data: alertRows, error: alertError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, notify_cinema_showtimes, notify_showtime_reminders, subscribed_branch_ids')
        .in('id', userIds),
      supabase
        .from('notification_log')
        .select('user_id, movie_id, branch_id')
        .eq('kind', 'showtime')
        .in('movie_id', movieIds)
        .in('user_id', userIds),
    ]);
    if (profileError) throw new Error(profileError.message);
    if (alertError) throw new Error(alertError.message);

    const alertedBranches = new Set(
      (alertRows ?? [])
        .filter((r) => r.branch_id)
        .map((r) => alertKey(r.user_id as string, r.movie_id as string, r.branch_id as string)),
    );

    const candidates = selectDueReminders({
      watchRows: watchRows as ReminderWatchRow[],
      cacheRows: (cacheRows ?? []) as ReminderCacheRow[],
      profiles: (profiles ?? []) as ReminderProfile[],
      alertedBranches,
      now,
    });

    if (candidates.length === 0) {
      return NextResponse.json({ due: 0, sent: 0 });
    }

    const dueMovieIds = [...new Set(candidates.map((d) => d.movieId))];
    const dueBranchIds = [...new Set(candidates.flatMap((d) => d.branchIds))];

    const [{ data: movies }, { data: branches }, { data: slugRows }] = await Promise.all([
      supabase.from('movies').select('id, title').in('id', dueMovieIds),
      supabase.from('branches').select('id, name').in('id', dueBranchIds),
      supabase.from('movie_branch_slugs').select('movie_id, branch_id, slug').in('movie_id', dueMovieIds),
    ]);
    const titleByMovie = new Map((movies ?? []).map((m) => [m.id as string, m.title as string]));
    const nameByBranch = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));
    const slugByPair = new Map((slugRows ?? []).map((r) => [`${r.movie_id}:${r.branch_id}`, r.slug as string]));

    // Same links /api/poll sends: Scene's per-movie page on that branch,
    // VOX's per-branch showtimes page (VOX has no per-movie link).
    function bookingUrlFor(movieId: string, branchId: string): string | null {
      if (chainForBranch(branchId) === 'vox') {
        return voxBranchShowtimesUrl(branchId as VoxBranchId);
      }
      const slug = slugByPair.get(`${movieId}:${branchId}`);
      const base = BRANCH_BASE_URLS[branchId as SceneBranchId];
      if (!slug || !base) return null;
      return `${base}/movie-details/${slug}.html`;
    }

    // Resolved before the per-run cap, so a row that can never be sent
    // (no title, no usable booking link) doesn't take a slot from one
    // that can, run after run.
    const due = candidates
      .map((reminder) => {
        const movieTitle = titleByMovie.get(reminder.movieId);
        const reminderBranches = reminder.branchIds
          .map((branchId) => {
            const bookingUrl = bookingUrlFor(reminder.movieId, branchId);
            const name = nameByBranch.get(branchId);
            return bookingUrl && name ? { name, bookingUrl } : null;
          })
          .filter((b): b is { name: string; bookingUrl: string } => b !== null);
        return movieTitle && reminderBranches.length > 0 ? { ...reminder, movieTitle, reminderBranches } : null;
      })
      .filter((r): r is ResolvedReminder => r !== null)
      .slice(0, MAX_PER_RUN);

    if (due.length === 0) {
      return NextResponse.json({ due: 0, sent: 0 });
    }

    async function sendOne(reminder: ResolvedReminder): Promise<SendOutcome> {
      if (Date.now() - startedAt > SEND_BUDGET_MS) return 'deferred';
      const { movieTitle, reminderBranches } = reminder;

      const { data: claimed, error: claimError } = await supabase
        .from('watchlist')
        .update({ last_bookable_alert_at: new Date().toISOString() })
        .eq('user_id', reminder.userId)
        .eq('movie_id', reminder.movieId)
        .lte('last_bookable_alert_at', cutoffIso)
        .select('movie_id');
      // Nothing claimed: another run got here first, or the movie was
      // removed from the radar since this run read the watchlist.
      if (claimError || !claimed || claimed.length === 0) return 'skipped';

      const showtimesPath = `/movies/${reminder.movieId}?tab=showtimes`;
      const payload = {
        movieId: reminder.movieId,
        movieTitle,
        branches: reminderBranches,
        showtimesUrl: `${siteUrl()}${showtimesPath}`,
        settingsUrl: `${siteUrl()}/account/edit`,
        removeToken: radarRemoveToken(reminder.userId, reminder.movieId),
      };

      // Independent best-effort channels, same as every other fan-out.
      try {
        await notifyShowtimeReminderByEmail(reminder.email, payload);
        await supabase.from('notification_deliveries').insert({
          user_id: reminder.userId,
          movie_id: reminder.movieId,
          branch_id: null,
          channel: 'email',
          success: true,
        });
      } catch (err) {
        await supabase.from('notification_deliveries').insert({
          user_id: reminder.userId,
          movie_id: reminder.movieId,
          branch_id: null,
          channel: 'email',
          success: false,
          error: String(err).slice(0, 500),
        });
      }

      try {
        const sentCount = await notifyShowtimeReminderPush(supabase, reminder.userId, payload);
        // Zero means no push subscriptions, so no send was attempted.
        if (sentCount > 0) {
          await supabase.from('notification_deliveries').insert({
            user_id: reminder.userId,
            movie_id: reminder.movieId,
            branch_id: null,
            channel: 'push',
            success: true,
          });
        }
      } catch (err) {
        await supabase.from('notification_deliveries').insert({
          user_id: reminder.userId,
          movie_id: reminder.movieId,
          branch_id: null,
          channel: 'push',
          success: false,
          error: String(err).slice(0, 500),
        });
      }

      // History feed entry. Not used for dedupe (the claim above is), so a
      // failed insert here doesn't change who gets reminded next.
      const branchNames = reminderBranches.map((b) => b.name).join(', ');
      await supabase.from('notification_log').insert({
        user_id: reminder.userId,
        movie_id: reminder.movieId,
        branch_id: null,
        kind: 'showtime_reminder',
        title: movieTitle,
        message: `${movieTitle} is still bookable at ${branchNames}.`,
        url: showtimesPath,
      });

      return 'sent';
    }

    const fanoutStartedAt = Date.now();
    const outcomes = await mapWithConcurrency(due, NOTIFY_CONCURRENCY, sendOne);
    const sent = outcomes.filter((o) => o === 'sent').length;
    const deferred = outcomes.filter((o) => o === 'deferred').length;

    logEvent({
      type: 'fanout_run',
      payload: {
        kind: 'showtime_reminder',
        recipientCount: due.length,
        notified: sent,
        duration_ms: Date.now() - fanoutStartedAt,
      },
    });

    return NextResponse.json({ due: due.length, sent, deferred });
  } catch (err) {
    logError('send-reminders', err);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}
