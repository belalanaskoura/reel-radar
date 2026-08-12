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

export type DataQualityIssue = NoPosterIssue | NoOverviewIssue | StuckBacklogIssue;

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

  return issues;
}
