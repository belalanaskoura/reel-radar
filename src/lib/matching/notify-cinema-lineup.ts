import type { SupabaseClient } from '@supabase/supabase-js';
import {
  notifyLineupAddedPush,
  notifyLineupRemovedPush,
} from '@/lib/push';
import {
  notifyLineupAddedByEmail,
  notifyLineupRemovedByEmail,
} from '@/lib/email';

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
  let notified = 0;

  for (const { user_id: userId } of followers) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_cinema_lineup')
      .eq('id', userId)
      .single();

    if (!profile?.notify_cinema_lineup) continue;
    if (!profile.email) continue; // nothing to notify with, skip entirely

    for (const movieId of newMovieIds) {
      const key = `${userId}:${movieId}`;
      if (alreadyNotifiedKeys.has(key)) continue;

      const movie = movieById.get(movieId);
      if (!movie) continue;

      const payload = {
        movieTitle: movie.title as string,
        branchName: branchRow.name as string,
        movieUrl: `${siteUrl}/movies/${movieId}`,
      };

      // Email and push are independent, best-effort channels: one
      // failing must never block the other or abort the rest of this
      // loop (same isolation as /api/poll's notifyWatchers).
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
        await notifyLineupAddedPush(supabase, userId as string, payload);
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
        notified += 1;
      } catch {
        // best-effort, swallow and continue
      }
    }
  }

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
  let notified = 0;

  for (const { user_id: userId } of followers) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_cinema_lineup')
      .eq('id', userId)
      .single();

    if (!profile?.notify_cinema_lineup) continue;
    if (!profile.email) continue; // nothing to notify with, skip entirely

    for (const movieId of removedMovieIds) {
      const key = `${userId}:${movieId}`;
      if (alreadyNotifiedKeys.has(key)) continue;

      const movie = movieById.get(movieId);
      if (!movie) continue;

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
        await notifyLineupRemovedPush(supabase, userId as string, payload);
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
        notified += 1;
      } catch {
        // best-effort, swallow and continue
      }
    }
  }

  return { notified };
}
