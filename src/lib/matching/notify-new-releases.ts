import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyNewReleasePush } from '@/lib/push';
import { notifyNewReleaseByEmail } from '@/lib/email';
import { mapWithConcurrency } from '@/lib/concurrency';
import { logEvent } from '@/lib/analytics';

const NOTIFY_CONCURRENCY = 10;

// Notifies watchers once when a watchlisted movie's release_date is first
// confirmed (goes from null to a real date). Distinct from /api/poll's
// per-branch bookable notification: this fires long before a movie is
// bookable anywhere, and isn't branch-scoped, so it's logged in
// notification_log with kind 'new_release' and a null branch_id rather
// than reusing the 'showtime' kind's per-branch rows.
export async function notifyNewReleases(
  supabase: SupabaseClient,
  newlyDatedMovieIds: string[],
): Promise<{ notified: number }> {
  if (newlyDatedMovieIds.length === 0) {
    return { notified: 0 };
  }

  const { data: watchedRows } = await supabase
    .from('watchlist')
    .select('movie_id, user_id')
    .in('movie_id', newlyDatedMovieIds);

  if (!watchedRows || watchedRows.length === 0) {
    return { notified: 0 };
  }

  const watchedMovieIds = [...new Set(watchedRows.map((r) => r.movie_id as string))];

  const { data: movies } = await supabase
    .from('movies')
    .select('id, title, release_date')
    .in('id', watchedMovieIds);

  const movieById = new Map((movies ?? []).map((m) => [m.id as string, m]));

  const { data: alreadyNotified } = await supabase
    .from('notification_log')
    .select('user_id, movie_id')
    .eq('kind', 'new_release')
    .in('movie_id', watchedMovieIds);

  const alreadyNotifiedKeys = new Set(
    (alreadyNotified ?? []).map((r) => `${r.user_id}:${r.movie_id}`),
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // Bounded concurrency instead of fully sequential -- a movie watched by
  // many users used to mean that many sequential email+push round trips in
  // one call (same risk as /api/poll's notifyWatchers).
  const fanoutStartedAt = Date.now();
  const results = await mapWithConcurrency(
    watchedRows,
    NOTIFY_CONCURRENCY,
    async ({ movie_id: movieId, user_id: userId }) => {
      const key = `${userId}:${movieId}`;
      if (alreadyNotifiedKeys.has(key)) return false;

      const movie = movieById.get(movieId as string);
      if (!movie?.release_date) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, notify_new_releases')
        .eq('id', userId)
        .single();

      if (!profile?.notify_new_releases) return false;
      if (!profile.email) return false; // nothing to notify with, skip entirely

      const payload = {
        movieTitle: movie.title as string,
        releaseDate: movie.release_date as string,
        movieUrl: `${siteUrl}/movies/${movieId}`,
      };

      try {
        await notifyNewReleaseByEmail(profile.email, payload);
      } catch {
        // best-effort, swallow and continue
      }

      try {
        await notifyNewReleasePush(supabase, userId as string, payload);
      } catch {
        // best-effort, swallow and continue
      }

      try {
        await supabase.from('notification_log').insert({
          user_id: userId,
          movie_id: movieId,
          branch_id: null,
          kind: 'new_release',
          title: payload.movieTitle,
          message: `${payload.movieTitle} is coming to Egypt on ${payload.releaseDate}!`,
          url: payload.movieUrl,
        });
        return true;
      } catch {
        // best-effort, swallow and continue
        return false;
      }
    },
  );

  const notified = results.filter(Boolean).length;
  logEvent({
    type: 'fanout_run',
    payload: { kind: 'new_release', recipientCount: watchedRows.length, notified, duration_ms: Date.now() - fanoutStartedAt },
  });

  return { notified };
}
