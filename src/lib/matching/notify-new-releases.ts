import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyNewReleasePush } from '@/lib/push';
import { notifyNewReleaseByEmail } from '@/lib/email';

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
  let notified = 0;

  for (const { movie_id: movieId, user_id: userId } of watchedRows) {
    const key = `${userId}:${movieId}`;
    if (alreadyNotifiedKeys.has(key)) continue;

    const movie = movieById.get(movieId as string);
    if (!movie?.release_date) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_new_releases')
      .eq('id', userId)
      .single();

    if (!profile?.notify_new_releases) continue;
    if (!profile.email) continue; // nothing to notify with, skip entirely

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
      notified += 1;
    } catch {
      // best-effort, swallow and continue
    }
  }

  return { notified };
}
