import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { checkBookability } from '@/lib/scene/fetcher';
import { notifyBookablePush } from '@/lib/push';
import { notifyBookableByEmail } from '@/lib/email';
import type { BranchId as SceneBranchId } from '@/lib/scene/types';
import { BRANCH_BASE_URLS } from '@/lib/scene/types';
import { chainForBranch, VOX_ELCINEMA_THEATER_IDS, voxBranchShowtimesUrl, type VoxBranchId } from '@/lib/branches';
import { fetchVoxShowtimes } from '@/lib/elcinema/vox-showtimes';
import { sleep as elcinemaSleep, REQUEST_DELAY_MS as ELCINEMA_DELAY_MS } from '@/lib/elcinema/fetcher';
import { logEvent } from '@/lib/analytics';

// The centralized poll job: checks bookability for every (movie, branch)
// pair that at least one user is watching, never per-user (per the
// Phase 1 scaling constraint), and notifies each watcher exactly once
// per bookable "episode" via notification_log. Triggered by an external
// scheduler hitting this route on an interval (see Phase 1: Vercel Hobby
// can't run cron faster than once/day, so there's no Vercel Cron entry
// here at all).
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  // Only (movie, branch) pairs with a watcher AND a known Scene slug are
  // worth polling: this is the scaling constraint, cost is bounded by
  // distinct watched movies, not by user count.
  const { data: watchedMovieIds } = await supabase.from('watchlist').select('movie_id');
  const distinctMovieIds = [...new Set((watchedMovieIds ?? []).map((r) => r.movie_id))];

  if (distinctMovieIds.length === 0) {
    logEvent({
      type: 'poll_run',
      payload: { checked: 0, notified: 0, pair_errors: 0, duration_ms: Date.now() - startedAt },
    });
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  const { data: slugRows } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id, branch_id, slug')
    .in('movie_id', distinctMovieIds);

  let checked = 0;
  let notified = 0;
  let pairErrors = 0;

  for (const row of slugRows ?? []) {
    const branch = row.branch_id;

    try {
      const chain = chainForBranch(branch);

      // Read the previous state before writing the new one, so wasBookable
      // reflects last poll's result, not this one.
      const { data: existingCache } = await supabase
        .from('showtimes_cache')
        .select('bookable')
        .eq('movie_id', row.movie_id)
        .eq('branch_id', branch)
        .maybeSingle();
      const wasBookable = existingCache?.bookable ?? false;

      let bookable: boolean;
      let bookingUrl: string;

      if (chain === 'scene') {
        const sceneBranch = branch as SceneBranchId;
        const movieDetailsUrl = `${BRANCH_BASE_URLS[sceneBranch]}/movie-details/${row.slug}.html`;
        const bookability = await checkBookability(movieDetailsUrl);
        bookable = bookability.bookable;
        bookingUrl = movieDetailsUrl;

        await supabase.from('showtimes_cache').upsert(
          {
            movie_id: row.movie_id,
            branch_id: branch,
            bookable,
            last_checked_at: new Date().toISOString(),
            raw_showtimes: bookability.availableDates,
          },
          { onConflict: 'movie_id,branch_id' },
        );
      } else {
        // VOX has no cheap bookability-only check (every elCinema request
        // returns full showtime detail) and no per-movie/per-showtime
        // booking link -- every VOX branch just links to VOX's homepage.
        // Only today is checked here (1 request); the fuller 5-day
        // raw_showtimes list is scrape-vox's job, so this deliberately
        // updates bookable/last_checked_at only and leaves raw_showtimes
        // alone rather than overwriting it with a 1-day snapshot.
        const theaterId = VOX_ELCINEMA_THEATER_IDS[branch as VoxBranchId];
        const today = new Date().toISOString().slice(0, 10);
        await elcinemaSleep(ELCINEMA_DELAY_MS);
        const day = await fetchVoxShowtimes(theaterId, today);
        const movie = day.movies.find((m) => String(m.elcinemaId) === row.slug);
        bookable = !!movie && movie.formats.some((f) => f.showtimes.length > 0);
        bookingUrl = voxBranchShowtimesUrl(branch as VoxBranchId);

        await supabase
          .from('showtimes_cache')
          .update({ bookable, last_checked_at: new Date().toISOString() })
          .eq('movie_id', row.movie_id)
          .eq('branch_id', branch);
      }

      checked += 1;

      if (!bookable) {
        if (wasBookable) {
          // Transitioned back to not-bookable: clear the log so a future
          // re-opening (added showtimes, re-release) notifies again.
          await supabase
            .from('notification_log')
            .delete()
            .eq('movie_id', row.movie_id)
            .eq('branch_id', branch)
            .eq('kind', 'showtime');
        }
        continue;
      }

      if (wasBookable) continue; // already bookable last poll, nothing new

      notified += await notifyWatchers(supabase, row.movie_id, branch, bookingUrl);
    } catch {
      // One bad pair (a scraper hiccup, a transient Supabase error) must
      // not abort every pair after it in this run.
      pairErrors += 1;
    }
  }

  logEvent({
    type: 'poll_run',
    payload: { checked, notified, pair_errors: pairErrors, duration_ms: Date.now() - startedAt },
  });

  return NextResponse.json({ checked, notified });
}

async function notifyWatchers(
  supabase: ReturnType<typeof createServiceRoleClient>,
  movieId: string,
  branch: string,
  bookingUrl: string,
): Promise<number> {
  const { data: movie } = await supabase.from('movies').select('title').eq('id', movieId).single();
  const { data: branchRow } = await supabase.from('branches').select('name').eq('id', branch).single();
  if (!movie || !branchRow) return 0;

  const { data: watchers } = await supabase.from('watchlist').select('user_id').eq('movie_id', movieId);
  if (!watchers || watchers.length === 0) return 0;

  const { data: alreadyNotified } = await supabase
    .from('notification_log')
    .select('user_id')
    .eq('movie_id', movieId)
    .eq('branch_id', branch)
    .eq('kind', 'showtime');
  const alreadyNotifiedIds = new Set((alreadyNotified ?? []).map((r) => r.user_id));

  let sentCount = 0;

  for (const watcher of watchers) {
    if (alreadyNotifiedIds.has(watcher.user_id)) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_cinema_showtimes, subscribed_branch_ids')
      .eq('id', watcher.user_id)
      .single();

    if (!profile?.notify_cinema_showtimes) continue;
    // null means "every branch" (the default, and what every existing
    // user effectively had before this column existed) -- only a
    // non-null array narrows to specific branches. Not logged as
    // notified: if this user later subscribes to this branch, they
    // should still be able to see this movie is already bookable here,
    // not have it permanently marked "already told you" for a
    // notification they never actually got.
    if (profile.subscribed_branch_ids && !profile.subscribed_branch_ids.includes(branch)) continue;
    if (!profile.email) continue; // nothing to notify with, skip entirely

    const payload = { movieTitle: movie.title, branchName: branchRow.name, bookingUrl };

    // Email and push are independent, best-effort channels: one failing
    // must never block the other or abort the rest of this watcher loop
    // (a real bug in an earlier version, where an uncaught send error
    // killed every notification after it in the same poll run).
    try {
      await notifyBookableByEmail(profile.email, payload);
      await supabase.from('notification_deliveries').insert({
        user_id: watcher.user_id,
        movie_id: movieId,
        branch_id: branch,
        channel: 'email',
        success: true,
      });
    } catch (err) {
      await supabase.from('notification_deliveries').insert({
        user_id: watcher.user_id,
        movie_id: movieId,
        branch_id: branch,
        channel: 'email',
        success: false,
        error: String(err).slice(0, 500),
      });
    }

    try {
      await notifyBookablePush(supabase, watcher.user_id, payload);
      await supabase.from('notification_deliveries').insert({
        user_id: watcher.user_id,
        movie_id: movieId,
        branch_id: branch,
        channel: 'push',
        success: true,
      });
    } catch (err) {
      await supabase.from('notification_deliveries').insert({
        user_id: watcher.user_id,
        movie_id: movieId,
        branch_id: branch,
        channel: 'push',
        success: false,
        error: String(err).slice(0, 500),
      });
    }

    // Logged once an email attempt was made, regardless of outcome: this
    // job has no retry mechanism for either channel, so a transient send
    // failure here permanently skips this watcher for this bookable
    // episode rather than resending on every subsequent poll. title/
    // message/url are a display snapshot for the /notifications-history
    // feed -- kept even though this row's only other job is dedupe,
    // since re-deriving "what did we actually tell this person" later
    // from movies/branches state would give the wrong answer once either
    // changes.
    try {
      await supabase.from('notification_log').insert({
        user_id: watcher.user_id,
        movie_id: movieId,
        branch_id: branch,
        kind: 'showtime',
        title: movie.title,
        message: `${movie.title} is bookable at ${branchRow.name}!`,
        url: bookingUrl,
      });
      sentCount += 1;
    } catch {
      // best-effort, swallow and continue
    }
  }

  return sentCount;
}
