import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { fetchUpcomingMovies } from '@/lib/tmdb';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isLikelyEgyptRelease } from '@/lib/matching/egypt-distributor-filter';
import { getEgyptReleaseInfo } from '@/lib/matching/egypt-release-date';
import { normalizeTitle } from '@/lib/matching/normalize';
import { removeUnreleasableMovies } from '@/lib/matching/remove-unreleasable';
import { notifyNewReleases } from '@/lib/matching/notify-new-releases';
import { findExistingMovieByTitle } from '@/lib/matching/find-existing-movie';
import { logEvent } from '@/lib/analytics';
import { mapWithConcurrency } from '@/lib/concurrency';

// Keeps sync-movies within the free external scheduler's 30s job timeout
// (no Vercel Cron on Hobby, see Phase 1) -- up to 100 fully sequential
// per-candidate TMDB/elCinema lookups measured at ~36s in production, over
// the cap. A modest batch size (not unlimited concurrency) keeps this from
// hammering elCinema, which still has its own courtesy delay per request
// inside getEgyptReleaseInfo.
const SYNC_CONCURRENCY = 10;

// Pulls upcoming movies from TMDB and upserts them into the `movies` table.
// Matched on tmdb_id so re-running is idempotent. Does not touch Scene
// Cinemas at all; that's Phase 4/5.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const today = new Date();
  // End-of-2029 cutoff, per the browse page's "browse through everything
  // coming out till 2029" goal: TMDB has very little confirmed data
  // that far out today, so this window will fill in gradually as TMDB's
  // own catalog does, not all at once.
  const endOf2029 = new Date(Date.UTC(2029, 11, 31));

  const fromDate = today.toISOString().slice(0, 10);
  const toDate = endOf2029.toISOString().slice(0, 10);

  const supabase = createServiceRoleClient();

  try {
    return await runSync(supabase, fromDate, toDate, startedAt);
  } catch (err) {
    // Previously, any failure anywhere in this route (including the final
    // upsert, which could fail after placeholderUpdates had already
    // written real rows -- a genuine partial-state case) produced a bare
    // 500 with no logEvent at all, unlike every other scheduled job's
    // try/catch-and-log pattern. The admin-digest's stuck-backlog check
    // reads analytics_events for a sync_run row to know the pipeline is
    // healthy; a silently-failed run left nothing for it to notice was
    // missing.
    const message = String(err).slice(0, 500);
    console.error('sync-movies failed:', message);
    logEvent({
      type: 'sync_run',
      payload: { accepted: 0, rejected: 0, duration_ms: Date.now() - startedAt, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runSync(
  supabase: ReturnType<typeof createServiceRoleClient>,
  fromDate: string,
  toDate: string,
  startedAt: number,
) {
  const candidates = await fetchUpcomingMovies(fromDate, toDate);

  // Every candidate is checked against the real Egypt-distributor history
  // (or the popularity safety net) before being stored; see
  // src/lib/matching/egypt-distributor-filter.ts for why this replaced
  // the earlier genre/language guesswork. Batched concurrently (see
  // mapWithConcurrency above) since these checks are independent
  // per-candidate TMDB lookups.
  const eligibility = await mapWithConcurrency(candidates, SYNC_CONCURRENCY, (movie) =>
    isLikelyEgyptRelease(supabase, movie),
  );
  const movies = candidates.filter((_, i) => eligibility[i]);
  const rejectedCount = candidates.length - movies.length;

  // elCinema is the source of truth for a movie's Egypt release date and
  // (as a fallback when TMDB has none) its poster; see
  // src/lib/matching/egypt-release-date.ts. TMDB remains the fallback
  // for movies elCinema has no record of, for both fields. Batched
  // concurrently for the same reason as above.
  // Before treating a candidate as new, check whether it already exists as
  // a tmdb_id-less Scene/VOX placeholder (this movie was scraped as a
  // listing before TMDB sync ever ran, or before this candidate cleared
  // the Egypt-distributor filter). If so, target that row's id directly so
  // the upsert below fills it in in place instead of inserting a second,
  // disconnected row -- the mirror image of the check scrape-scene/
  // scrape-vox now do before creating a placeholder. Without this, every
  // such placeholder sits stuck at tmdb_id null until the next
  // /api/match-movies run's reconciliation pass catches it -- correct
  // eventually, but a same-run fix is strictly better than depending on a
  // second, differently-scheduled job to close the gap.
  type SyncRow = {
    tmdb_id: number;
    title: string;
    original_title: string;
    poster_path: string | null;
    release_date: string | null;
    popularity: number;
    match_status: 'matched';
  };

  const placeholderUpdates: { id: string; fields: SyncRow }[] = [];
  const remainingRows: SyncRow[] = [];

  await mapWithConcurrency(movies, SYNC_CONCURRENCY, async (m) => {
    const egyptInfo = await getEgyptReleaseInfo(supabase, m.id, m.title);
    const existingPlaceholderId = await findExistingMovieByTitle(supabase, m.title, {
      placeholdersOnly: true,
    });
    const fields = {
      tmdb_id: m.id,
      title: m.title,
      original_title: m.original_title,
      poster_path: m.poster_path || egyptInfo.posterUrl || null,
      release_date: egyptInfo.releaseDate || m.release_date || null,
      popularity: m.popularity,
      match_status: 'matched' as const,
    };

    if (existingPlaceholderId) {
      placeholderUpdates.push({ id: existingPlaceholderId, fields });
    } else {
      remainingRows.push(fields);
    }
  });

  // Rows that matched an existing Scene/VOX placeholder by title are
  // updated in place via their own id, not folded into the bulk upsert
  // below: that upsert is keyed on `onConflict: 'tmdb_id'`, which only
  // triggers Postgres's ON CONFLICT path for a conflict on tmdb_id --
  // supplying a placeholder's existing id alongside a tmdb_id that isn't
  // in the table yet would instead collide on the primary key and throw,
  // since the conflict target named here is tmdb_id, not id.
  for (const { id, fields } of placeholderUpdates) {
    await supabase.from('movies').update(fields).eq('id', id);
  }

  // TMDB itself occasionally has two distinct tmdb_ids for the same real
  // movie (confirmed for real: "aks seir" existed as both 1728650 and
  // 1728604, same director/writer/cast/release date, one just a
  // sparser duplicate entry). `onConflict: 'tmdb_id'` only catches
  // re-syncing the *same* tmdb_id, so a same-title-and-date candidate
  // with a *different* tmdb_id is checked against already-stored movies
  // and skipped here, scoped narrowly to an exact normalized-title +
  // exact release_date match (not fuzzy), since two genuinely different
  // movies sharing both is effectively never real, while a broader/fuzzy
  // match risks merging unrelated films.
  const dedupedRows = [];
  let skippedDuplicates = 0;
  for (const row of remainingRows) {
    if (!row.release_date) {
      dedupedRows.push(row);
      continue;
    }

    const { data: sameDateMovies } = await supabase
      .from('movies')
      .select('tmdb_id, title')
      .eq('release_date', row.release_date)
      .neq('tmdb_id', row.tmdb_id)
      .not('tmdb_id', 'is', null);

    const normalizedTitle = normalizeTitle(row.title);
    const isDuplicate = (sameDateMovies ?? []).some(
      (existing) => normalizeTitle(existing.title) === normalizedTitle,
    );

    if (isDuplicate) {
      skippedDuplicates += 1;
    } else {
      dedupedRows.push(row);
    }
  }

  // Snapshot each candidate's previously-stored release_date before
  // upserting, so a null -> real-date transition can be detected
  // afterward to drive the "new release" watcher notification below.
  // Keyed by tmdb_id since dedupedRows don't carry the movies.id yet.
  const tmdbIds = dedupedRows.map((r) => r.tmdb_id);
  const { data: previousRows } = await supabase
    .from('movies')
    .select('tmdb_id, release_date')
    .in('tmdb_id', tmdbIds);
  const previousReleaseDateByTmdbId = new Map(
    (previousRows ?? []).map((r) => [r.tmdb_id as number, r.release_date as string | null]),
  );

  const { error } = await supabase.from('movies').upsert(dedupedRows, {
    onConflict: 'tmdb_id',
    ignoreDuplicates: false,
  });

  // Thrown, not returned directly: placeholderUpdates above already wrote
  // real rows by this point, and a bare early return here (the previous
  // behavior) skipped the logEvent call entirely, leaving no trace of a
  // failed run with real partial side effects already applied. Throwing
  // routes this through the outer try/catch's own log-and-500 handling
  // instead, same as every other failure in this route now.
  if (error) {
    throw new Error(`Failed to upsert movies: ${error.message}`);
  }

  const newlyDatedTmdbIds = dedupedRows
    .filter((r) => r.release_date && !previousReleaseDateByTmdbId.get(r.tmdb_id))
    .map((r) => r.tmdb_id);

  let newReleasesNotified = 0;
  if (newlyDatedTmdbIds.length > 0) {
    const { data: newlyDatedMovies } = await supabase
      .from('movies')
      .select('id')
      .in('tmdb_id', newlyDatedTmdbIds);
    const newlyDatedMovieIds = (newlyDatedMovies ?? []).map((m) => m.id as string);
    const result = await notifyNewReleases(supabase, newlyDatedMovieIds);
    newReleasesNotified = result.notified;
  }

  // Catalog cleanup: a movie whose release_date has passed with zero
  // Scene listings on either branch is never coming to Egypt cinemas --
  // see src/lib/matching/remove-unreleasable.ts for why that's a safe
  // permanent removal rather than just hiding it.
  const { removed } = await removeUnreleasableMovies(supabase);

  logEvent({
    type: 'sync_run',
    payload: {
      accepted: movies.length,
      rejected: rejectedCount,
      duration_ms: Date.now() - startedAt,
      error: null,
    },
  });

  return NextResponse.json({
    synced: dedupedRows.length,
    placeholdersAttached: placeholderUpdates.length,
    candidates: candidates.length,
    skippedDuplicates,
    removed,
    newReleasesNotified,
  });
}
