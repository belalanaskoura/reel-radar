import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMovieDetails } from '../tmdb';

// A movie stuck unmatched/ambiguous for less than this isn't worth
// surfacing yet -- match-movies runs every ~30 min per cron-job.org's
// schedule, so anything under a day could still resolve on its own.
const STUCK_BACKLOG_DAYS = 3;

export interface NoPosterIssue {
  kind: 'no_poster';
  movieId: string;
  title: string;
}

export interface NoOverviewIssue {
  kind: 'no_overview';
  movieId: string;
  title: string;
  tmdbId: number;
}

export interface StuckBacklogIssue {
  kind: 'stuck_backlog';
  movieId: string;
  title: string;
  matchStatus: string;
  daysStuck: number;
}

// Raised by /api/check-scene-prices (see src/lib/scene/price-template.ts)
// when a live lock/unlock price read for a branch+format disagrees with
// the admin-maintained scene_price_templates row -- surfaced here rather
// than acted on automatically, since a template update is a real-world
// fact only an admin should confirm (a single flaky/stale scrape
// shouldn't silently overwrite a human-entered price).
export interface PriceMismatchIssue {
  kind: 'price_mismatch';
  branchId: string;
  format: string;
  templatePriceEgp: number;
  liveObservedPriceEgp: number;
}

export type DataQualityIssue = NoPosterIssue | NoOverviewIssue | StuckBacklogIssue | PriceMismatchIssue;

// The no-poster and stuck-backlog checks only: both plain, cheap column
// queries with no external API calls, safe to run on every /admin page
// load for the dashboard banner. Split out from the full
// findDataQualityIssues (which also does a real per-movie TMDB call for
// the no-overview check) specifically so the dashboard doesn't pay that
// cost on every view -- that check stays scoped to the once-daily
// digest job only, see /api/admin-digest.
export async function findCheapDataQualityIssues(
  supabase: SupabaseClient,
): Promise<(NoPosterIssue | StuckBacklogIssue)[]> {
  const issues: (NoPosterIssue | StuckBacklogIssue)[] = [];

  const { data: noPosterRows } = await supabase
    .from('movies')
    .select('id, title')
    .is('poster_path', null)
    .in('match_status', ['matched', 'unmatched', 'ambiguous']);

  for (const row of noPosterRows ?? []) {
    issues.push({ kind: 'no_poster', movieId: row.id, title: row.title });
  }

  const stuckCutoff = new Date(Date.now() - STUCK_BACKLOG_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: stuckRows } = await supabase
    .from('movies')
    .select('id, title, match_status, created_at')
    .in('match_status', ['unmatched', 'ambiguous'])
    .lt('created_at', stuckCutoff);

  for (const row of stuckRows ?? []) {
    const daysStuck = Math.floor((Date.now() - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000));
    issues.push({
      kind: 'stuck_backlog',
      movieId: row.id,
      title: row.title,
      matchStatus: row.match_status,
      daysStuck,
    });
  }

  return issues;
}

// Adds the no-TMDB-overview check on top of findCheapDataQualityIssues:
// a real per-movie TMDB API call, so this is scoped to only movies
// matched since `sinceIso` (see matched_at on match-to-tmdb.ts's
// applyTmdbMatch) rather than the whole catalog -- a matched movie's
// overview essentially never changes after the fact, so re-checking
// movies matched long ago on every run would be pure waste that only
// grows with the catalog. Used by the digest job only, not the
// dashboard (see findCheapDataQualityIssues for that).
export async function findDataQualityIssues(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<DataQualityIssue[]> {
  const issues: DataQualityIssue[] = await findCheapDataQualityIssues(supabase);

  const { data: recentlyMatched } = await supabase
    .from('movies')
    .select('id, title, tmdb_id')
    .eq('match_status', 'matched')
    .not('tmdb_id', 'is', null)
    .gte('matched_at', sinceIso);

  for (const row of recentlyMatched ?? []) {
    try {
      const details = await fetchMovieDetails(row.tmdb_id);
      if (!details.overview || !details.overview.trim()) {
        issues.push({ kind: 'no_overview', movieId: row.id, title: row.title, tmdbId: row.tmdb_id });
      }
    } catch {
      // TMDB unreachable for this one movie -- skip it rather than
      // failing the whole digest over a single lookup; it'll be
      // re-checked next run since matched_at doesn't change.
    }
  }

  // /api/check-scene-prices logs one price_check_run analytics event per
  // (branch, format) spot-check -- read back any real mismatch since the
  // last digest rather than storing a separate flags table, the same
  // "read the event log since last run" pattern the no-overview check
  // above uses for admin_digest_run itself. matched: null (couldn't
  // verify a live price this run, e.g. the lock click raced the widget's
  // render) is deliberately NOT surfaced -- only a confirmed mismatch is
  // worth an admin's attention.
  const { data: priceCheckEvents } = await supabase
    .from('analytics_events')
    .select('payload')
    .eq('event_type', 'price_check_run')
    .gte('occurred_at', sinceIso);

  for (const row of priceCheckEvents ?? []) {
    const payload = row.payload as {
      branch: string;
      format: string;
      matched: boolean | null;
      templatePriceEgp: number;
      liveObservedPriceEgp: number | null;
    };
    if (payload.matched === false && payload.liveObservedPriceEgp != null) {
      issues.push({
        kind: 'price_mismatch',
        branchId: payload.branch,
        format: payload.format,
        templatePriceEgp: payload.templatePriceEgp,
        liveObservedPriceEgp: payload.liveObservedPriceEgp,
      });
    }
  }

  return issues;
}
