import type { SupabaseClient } from '@supabase/supabase-js';
import {
  notifyLineupAddedPush,
  notifyLineupRemovedPush,
} from '@/lib/push';
import {
  notifyLineupAddedByEmail,
  notifyLineupRemovedByEmail,
} from '@/lib/email';
import { mapWithConcurrency } from '@/lib/concurrency';
import { logEvent } from '@/lib/analytics';

// Both notify functions below fan out over every (follower, newly-added-or-
// removed movie) pair -- a scrape/delist run touching several movies at a
// well-followed cinema can mean hundreds of these. Called inline from
// scrape-scene/scrape-scene-delist/scrape-vox, so a fully sequential fan-out
// here directly threatens those routes' own cron-job.org 30s timeout (which
// scrape-scene has already hit once for an unrelated reason -- see its own
// file comment). Same concurrency cap used elsewhere for this shape.
const NOTIFY_CONCURRENCY = 10;

// Notifies everyone following a cinema branch when a movie joins or
// leaves that branch's lineup -- distinct from /api/poll's per-movie
// 'showtime' notification (which only fires for movies a user has
// explicitly watchlisted) and notify-new-releases.ts's 'new_release'
// kind (which isn't branch-scoped at all). Logged in notification_log
// with kind 'lineup_added'/'lineup_removed' and a real branch_id, same
// dedupe-via-notification_log pattern as both of those.
export async function notifyLineupAdditions(
  supabase: SupabaseClient,
  branchId: string,
  newMovieIds: string[],
): Promise<{ notified: number }> {
  if (newMovieIds.length === 0) return { notified: 0 };

  const { data: followers } = await supabase
    .from('cinema_follows')
    .select('user_id')
    .eq('branch_id', branchId);
  if (!followers || followers.length === 0) return { notified: 0 };

  const { data: branchRow } = await supabase
    .from('branches')
    .select('name')
    .eq('id', branchId)
    .single();
  if (!branchRow) return { notified: 0 };

  const { data: movies } = await supabase
    .from('movies')
    .select('id, title')
    .in('id', newMovieIds);
  const movieById = new Map((movies ?? []).map((m) => [m.id as string, m]));

  const { data: alreadyNotified } = await supabase
    .from('notification_log')
    .select('user_id, movie_id')
    .eq('kind', 'lineup_added')
    .eq('branch_id', branchId)
    .in('movie_id', newMovieIds);
  const alreadyNotifiedKeys = new Set(
    (alreadyNotified ?? []).map((r) => `${r.user_id}:${r.movie_id}`),
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // One profile lookup per follower (not per follower×movie pair), fetched
  // upfront so the concurrent fan-out below doesn't repeat it.
  const profileByUserId = new Map<string, { email: string | null; notify_cinema_lineup: boolean | null }>();
  await mapWithConcurrency(followers, NOTIFY_CONCURRENCY, async ({ user_id: userId }) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_cinema_lineup')
      .eq('id', userId)
      .single();
    if (profile) profileByUserId.set(userId as string, profile);
  });

  const pairs = followers.flatMap(({ user_id: userId }) =>
    newMovieIds.map((movieId) => ({ userId: userId as string, movieId })),
  );

  const fanoutStartedAt = Date.now();
  const results = await mapWithConcurrency(pairs, NOTIFY_CONCURRENCY, async ({ userId, movieId }) => {
    const profile = profileByUserId.get(userId);
    if (!profile?.notify_cinema_lineup) return false;
    if (!profile.email) return false; // nothing to notify with, skip entirely

    const key = `${userId}:${movieId}`;
    if (alreadyNotifiedKeys.has(key)) return false;

    const movie = movieById.get(movieId);
    if (!movie) return false;

    const payload = {
      movieTitle: movie.title as string,
      branchName: branchRow.name as string,
      movieUrl: `${siteUrl}/movies/${movieId}`,
    };

    // Email and push are independent, best-effort channels: one failing
    // must never block the other or abort any other pair being notified
    // concurrently (same isolation as /api/poll's notifyWatchers).
    try {
      await notifyLineupAddedByEmail(profile.email, payload);
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'email',
        success: true,
      });
    } catch (err) {
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'email',
        success: false,
        error: String(err).slice(0, 500),
      });
    }

    try {
      await notifyLineupAddedPush(supabase, userId, payload);
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'push',
        success: true,
      });
    } catch (err) {
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'push',
        success: false,
        error: String(err).slice(0, 500),
      });
    }

    try {
      await supabase.from('notification_log').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        kind: 'lineup_added',
        title: payload.movieTitle,
        message: `${payload.movieTitle} is now at ${payload.branchName}!`,
        url: `/movies/${movieId}`,
      });
      return true;
    } catch {
      // best-effort, swallow and continue
      return false;
    }
  });

  const notified = results.filter(Boolean).length;
  logEvent({
    type: 'fanout_run',
    payload: { kind: 'lineup_added', recipientCount: pairs.length, notified, duration_ms: Date.now() - fanoutStartedAt },
  });

  return { notified };
}

export async function notifyLineupRemovals(
  supabase: SupabaseClient,
  branchId: string,
  removedMovieIds: string[],
): Promise<{ notified: number }> {
  if (removedMovieIds.length === 0) return { notified: 0 };

  const { data: followers } = await supabase
    .from('cinema_follows')
    .select('user_id')
    .eq('branch_id', branchId);
  if (!followers || followers.length === 0) return { notified: 0 };

  const { data: branchRow } = await supabase
    .from('branches')
    .select('name')
    .eq('id', branchId)
    .single();
  if (!branchRow) return { notified: 0 };

  const { data: movies } = await supabase
    .from('movies')
    .select('id, title')
    .in('id', removedMovieIds);
  const movieById = new Map((movies ?? []).map((m) => [m.id as string, m]));

  const { data: alreadyNotified } = await supabase
    .from('notification_log')
    .select('user_id, movie_id')
    .eq('kind', 'lineup_removed')
    .eq('branch_id', branchId)
    .in('movie_id', removedMovieIds);
  const alreadyNotifiedKeys = new Set(
    (alreadyNotified ?? []).map((r) => `${r.user_id}:${r.movie_id}`),
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const cinemaUrl = `${siteUrl}/cinemas/${branchId}`;

  // One profile lookup per follower (not per follower×movie pair), fetched
  // upfront so the concurrent fan-out below doesn't repeat it.
  const profileByUserId = new Map<string, { email: string | null; notify_cinema_lineup: boolean | null }>();
  await mapWithConcurrency(followers, NOTIFY_CONCURRENCY, async ({ user_id: userId }) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_cinema_lineup')
      .eq('id', userId)
      .single();
    if (profile) profileByUserId.set(userId as string, profile);
  });

  const pairs = followers.flatMap(({ user_id: userId }) =>
    removedMovieIds.map((movieId) => ({ userId: userId as string, movieId })),
  );

  const fanoutStartedAt = Date.now();
  const results = await mapWithConcurrency(pairs, NOTIFY_CONCURRENCY, async ({ userId, movieId }) => {
    const profile = profileByUserId.get(userId);
    if (!profile?.notify_cinema_lineup) return false;
    if (!profile.email) return false; // nothing to notify with, skip entirely

    const key = `${userId}:${movieId}`;
    if (alreadyNotifiedKeys.has(key)) return false;

    const movie = movieById.get(movieId);
    if (!movie) return false;

    const payload = {
      movieTitle: movie.title as string,
      branchName: branchRow.name as string,
      cinemaUrl,
    };

    try {
      await notifyLineupRemovedByEmail(profile.email, payload);
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'email',
        success: true,
      });
    } catch (err) {
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'email',
        success: false,
        error: String(err).slice(0, 500),
      });
    }

    try {
      await notifyLineupRemovedPush(supabase, userId, payload);
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'push',
        success: true,
      });
    } catch (err) {
      await supabase.from('notification_deliveries').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        channel: 'push',
        success: false,
        error: String(err).slice(0, 500),
      });
    }

    try {
      await supabase.from('notification_log').insert({
        user_id: userId,
        movie_id: movieId,
        branch_id: branchId,
        kind: 'lineup_removed',
        title: payload.movieTitle,
        message: `${payload.movieTitle} has left ${payload.branchName}.`,
        url: `/cinemas/${branchId}`,
      });
      return true;
    } catch {
      // best-effort, swallow and continue
      return false;
    }
  });

  const notified = results.filter(Boolean).length;
  logEvent({
    type: 'fanout_run',
    payload: { kind: 'lineup_removed', recipientCount: pairs.length, notified, duration_ms: Date.now() - fanoutStartedAt },
  });

  return { notified };
}
