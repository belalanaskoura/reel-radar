import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
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
import { logError } from '@/lib/logger';
import { mapWithConcurrency } from '@/lib/concurrency';

// Watchers for one (movie, branch) pair are notified concurrently, not
// sequentially -- see notifyWatchers below for why. Same cap sync-movies
// uses for TMDB calls.
const NOTIFY_CONCURRENCY = 10;

// Pairs checked (one real Scene/elCinema request each) per call. Poll
// grew past cron-job.org's 30s job timeout and admin's manual-trigger
// maxDuration=60 alike once the watched catalog reached 54 pairs (real
// runs logging duration_ms in the 60000-70000 range) -- both reported
// the job as failed even though it always finished with pair_errors: 0.
// Same offset-batching fix as scrape-scene: cron-job.org calls this
// several times at staggered offsets to cover every watched pair each
// sweep, and admin's "Re-run" loops offsets itself (see actions.ts).
//
// Batched per chain, not as one flat interleaved list: a flat BATCH_SIZE
// mixed cheap Scene bookability checks with expensive VOX ones unevenly
// -- confirmed for real, a 15-pair batch that happened to land 9 VOX
// pairs (each a full elCinema detail fetch, some hitting the fetcher's
// per-request timeout, plus a 1s delay between each) took over 30s on
// its own while a Scene-only batch of the same size finished in single
// digits. Scene stays large since each check is cheap; VOX is kept to 2
// so even a full-timeout worst case (2 x (REQUEST_TIMEOUT_MS + 1s delay))
// stays comfortably under cron-job.org's 30s job ceiling.
const BATCH_SIZE: Record<'scene' | 'vox', number> = {
  scene: 15,
  vox: 2,
};

// The centralized poll job: checks bookability for every (movie, branch)
// pair that at least one user is watching, never per-user (per the
// Phase 1 scaling constraint), and notifies each watcher exactly once
// per bookable "episode" via notification_log. Triggered by an external
// scheduler hitting this route on an interval (see Phase 1: Vercel Hobby
// can't run cron faster than once/day, so there's no Vercel Cron entry
// here at all).
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const chainParam = url.searchParams.get('chain');
  if (chainParam && chainParam !== 'scene' && chainParam !== 'vox') {
    return NextResponse.json({ error: `Unknown chain: ${chainParam}` }, { status: 400 });
  }
  const chainFilter = chainParam as 'scene' | 'vox' | null;

  const offsetParam = url.searchParams.get('offset');
  const offset = offsetParam ? Number(offsetParam) : 0;
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: `Invalid offset: ${offsetParam}` }, { status: 400 });
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
      payload: { checked: 0, notified: 0, pair_errors: 0, duration_ms: Date.now() - startedAt, batchSize: 0, offset },
    });
    return NextResponse.json({ checked: 0, notified: 0, batchSize: 0 });
  }

  // Ordered explicitly: without it Postgres gives no row-order guarantee
  // at all, so staggered offset calls (0, 15, 30, ...) could each see a
  // differently-shuffled result set, skipping some pairs and re-checking
  // others instead of the whole watched set being covered exactly once
  // per sweep.
  const { data: allSlugRows } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id, branch_id, slug')
    .in('movie_id', distinctMovieIds)
    .order('movie_id', { ascending: true })
    .order('branch_id', { ascending: true });

  // Split by chain before paging: a flat index-based slice across both
  // chains is what caused the offset=30 batch to land mostly-VOX pairs
  // and blow the timeout (see BATCH_SIZE's comment). No ?chain= (an old
  // caller, or the distinctMovieIds-empty short-circuit above) covers
  // every pair in one list, matching the pre-split behavior.
  const chainRows = (allSlugRows ?? []).filter((row) => {
    if (!chainFilter) return true;
    return chainForBranch(row.branch_id) === chainFilter;
  });
  const effectiveBatchSize = chainFilter ? BATCH_SIZE[chainFilter] : BATCH_SIZE.scene + BATCH_SIZE.vox;
  const slugRows = chainRows.slice(offset, offset + effectiveBatchSize);

  let checked = 0;
  let notified = 0;
  let pairErrors = 0;

  for (const row of slugRows) {
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
    } catch (err) {
      // One bad pair (a scraper hiccup, a transient Supabase error) must
      // not abort every pair after it in this run.
      pairErrors += 1;
      logError('poll', err, { movieId: row.movie_id, branchId: branch });
    }
  }

  logEvent({
    type: 'poll_run',
    payload: {
      checked,
      notified,
      pair_errors: pairErrors,
      duration_ms: Date.now() - startedAt,
      batchSize: slugRows.length,
      offset,
      chain: chainFilter ?? undefined,
    },
  });

  return NextResponse.json({ checked, notified, batchSize: slugRows.length });
}

async function notifyWatchers(
  supabase: ReturnType<typeof createServiceRoleClient>,
  movieId: string,
  branch: string,
  bookingUrl: string,
): Promise<number> {
  const { data: movieRow } = await supabase.from('movies').select('title').eq('id', movieId).single();
  const { data: branchInfoRow } = await supabase.from('branches').select('name').eq('id', branch).single();
  if (!movieRow || !branchInfoRow) return 0;
  // Narrowed to non-null locals so the closure below doesn't need TS to
  // re-derive narrowing across the function boundary.
  const movie = movieRow;
  const branchRow = branchInfoRow;

  const { data: watchers } = await supabase.from('watchlist').select('user_id').eq('movie_id', movieId);
  if (!watchers || watchers.length === 0) return 0;

  const { data: alreadyNotified } = await supabase
    .from('notification_log')
    .select('user_id')
    .eq('movie_id', movieId)
    .eq('branch_id', branch)
    .eq('kind', 'showtime');
  const alreadyNotifiedIds = new Set((alreadyNotified ?? []).map((r) => r.user_id));

  async function notifyOneWatcher(watcher: { user_id: string }): Promise<boolean> {
    if (alreadyNotifiedIds.has(watcher.user_id)) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_cinema_showtimes, subscribed_branch_ids')
      .eq('id', watcher.user_id)
      .single();

    if (!profile?.notify_cinema_showtimes) return false;
    // null means "every branch" (the default, and what every existing
    // user effectively had before this column existed) -- only a
    // non-null array narrows to specific branches. Not logged as
    // notified: if this user later subscribes to this branch, they
    // should still be able to see this movie is already bookable here,
    // not have it permanently marked "already told you" for a
    // notification they never actually got.
    if (profile.subscribed_branch_ids && !profile.subscribed_branch_ids.includes(branch)) return false;
    if (!profile.email) return false; // nothing to notify with, skip entirely

    const payload = { movieTitle: movie.title, branchName: branchRow.name, bookingUrl };

    // Email and push are independent, best-effort channels: one failing
    // must never block the other or abort the rest of the watchers being
    // notified concurrently (a real bug in an earlier version, where an
    // uncaught send error killed every notification after it in the same
    // poll run).
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
      return true;
    } catch {
      // best-effort, swallow and continue
      return false;
    }
  }

  // Bounded concurrency, not fully sequential: a popular movie/branch with
  // dozens of watchers used to mean dozens of sequential email+push round
  // trips in one request, risking cron-job.org's 30s job timeout and a
  // typical serverless function timeout well before that (see
  // notifyLineupAdditions/Removals below, and /api/welcome-email's own
  // comment, for the same pattern already causing a real production
  // incident once). Same concurrency cap sync-movies uses for TMDB calls.
  const fanoutStartedAt = Date.now();
  const results = await mapWithConcurrency(watchers, NOTIFY_CONCURRENCY, notifyOneWatcher);
  const notified = results.filter(Boolean).length;

  // One event per (movie, branch) pair that actually had watchers -- rare
  // by nature (only when a movie transitions to bookable), so this is
  // real signal, not per-poll-cycle noise. Lets /admin track the
  // concurrency fix's real effect directly (recipientCount vs.
  // duration_ms) instead of inferring it from poll_run's own aggregate
  // duration, which also includes the bookability-check network calls.
  logEvent({
    type: 'fanout_run',
    payload: {
      kind: 'showtime',
      recipientCount: watchers.length,
      notified,
      duration_ms: Date.now() - fanoutStartedAt,
    },
  });

  return notified;
}
