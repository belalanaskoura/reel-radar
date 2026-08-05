import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { checkBookability } from '@/lib/scene/fetcher';
import { notifyBookable } from '@/lib/ntfy';
import { notifyBookableByEmail } from '@/lib/email';
import type { BranchId } from '@/lib/scene/types';
import { BRANCH_BASE_URLS } from '@/lib/scene/types';

// The centralized poll job: checks bookability for every (movie, branch)
// pair that at least one user is watching -- never per-user, per the
// Phase 1 scaling constraint -- and notifies each watcher exactly once
// per bookable "episode" via notification_log. Triggered by an external
// scheduler hitting this route on an interval (see Phase 1: Vercel Hobby
// can't run cron faster than once/day, so there's no Vercel Cron entry
// here at all).
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Only (movie, branch) pairs with a watcher AND a known Scene slug are
  // worth polling -- this is the scaling constraint: cost is bounded by
  // distinct watched movies, not by user count.
  const { data: watchedMovieIds } = await supabase.from('watchlist').select('movie_id');
  const distinctMovieIds = [...new Set((watchedMovieIds ?? []).map((r) => r.movie_id))];

  if (distinctMovieIds.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  const { data: slugRows } = await supabase
    .from('movie_branch_slugs')
    .select('movie_id, branch_id, slug')
    .in('movie_id', distinctMovieIds);

  let checked = 0;
  let notified = 0;

  for (const row of slugRows ?? []) {
    const branch = row.branch_id as BranchId;
    const movieDetailsUrl = `${BRANCH_BASE_URLS[branch]}/movie-details/${row.slug}.html`;

    const bookability = await checkBookability(movieDetailsUrl);
    checked += 1;

    const { data: existingCache } = await supabase
      .from('showtimes_cache')
      .select('bookable')
      .eq('movie_id', row.movie_id)
      .eq('branch_id', branch)
      .maybeSingle();

    const wasBookable = existingCache?.bookable ?? false;

    await supabase.from('showtimes_cache').upsert(
      {
        movie_id: row.movie_id,
        branch_id: branch,
        bookable: bookability.bookable,
        last_checked_at: new Date().toISOString(),
        raw_showtimes: bookability.availableDates,
      },
      { onConflict: 'movie_id,branch_id' },
    );

    if (!bookability.bookable) {
      if (wasBookable) {
        // Transitioned back to not-bookable -- clear the log so a future
        // re-opening (added showtimes, re-release) notifies again.
        await supabase
          .from('notification_log')
          .delete()
          .eq('movie_id', row.movie_id)
          .eq('branch_id', branch);
      }
      continue;
    }

    if (wasBookable) continue; // already bookable last poll, nothing new

    notified += await notifyWatchers(supabase, row.movie_id, branch, movieDetailsUrl);
  }

  return NextResponse.json({ checked, notified });
}

async function notifyWatchers(
  supabase: ReturnType<typeof createServiceRoleClient>,
  movieId: string,
  branch: BranchId,
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
    .eq('branch_id', branch);
  const alreadyNotifiedIds = new Set((alreadyNotified ?? []).map((r) => r.user_id));

  let sentCount = 0;

  for (const watcher of watchers) {
    if (alreadyNotifiedIds.has(watcher.user_id)) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('ntfy_topic, email')
      .eq('id', watcher.user_id)
      .single();

    if (!profile?.email) continue; // nothing to notify with, skip entirely

    const payload = { movieTitle: movie.title, branchName: branchRow.name, bookingUrl };

    // Email and ntfy are independent, best-effort channels -- one failing
    // must never block the other or abort the rest of this watcher loop
    // (a real bug in the pre-email version, where an uncaught ntfy error
    // killed every notification after it in the same poll run).
    try {
      await notifyBookableByEmail(profile.email, payload);
    } catch {
      // best-effort, swallow and continue
    }

    if (profile.ntfy_topic) {
      try {
        await notifyBookable(profile.ntfy_topic, payload);
      } catch {
        // best-effort, swallow and continue
      }
    }

    // Logged once an email attempt was made, regardless of outcome -- this
    // job has no retry mechanism for either channel, so a transient send
    // failure here permanently skips this watcher for this bookable
    // episode rather than resending on every subsequent poll.
    try {
      await supabase
        .from('notification_log')
        .insert({ user_id: watcher.user_id, movie_id: movieId, branch_id: branch });
      sentCount += 1;
    } catch {
      // best-effort, swallow and continue
    }
  }

  return sentCount;
}
