import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { mergeSceneDuplicates } from '@/lib/matching/merge-scene-duplicates';
import { matchScenesToTmdb } from '@/lib/matching/match-to-tmdb';
import { logEvent } from '@/lib/analytics';
import { logError } from '@/lib/logger';

// Reconciles Scene-sourced placeholder movies (created by Phase 4's
// scraper, tmdb_id null) against TMDB. Two steps: first merge duplicate
// placeholders that represent the same movie listed on both branches,
// then match one BATCH_SIZE-sized slice (?offset=, see match-to-tmdb.ts)
// of the remaining unmatched backlog to a real TMDB entry (or flag it
// ambiguous/unmatched for manual review; never guess). cron-job.org calls
// this at staggered offsets to cover a large backlog over several runs,
// same shape as scrape-scene's own batching.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const offsetParam = url.searchParams.get('offset');
  const offset = offsetParam ? Number(offsetParam) : 0;
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: `Invalid offset: ${offsetParam}` }, { status: 400 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  try {
    // Only run on the first batch of a sweep: merging duplicates ahead of
    // every offset call would re-scan the whole backlog for no benefit
    // once offset > 0 has already passed the merge stage this run.
    const mergeResult =
      offset === 0 ? await mergeSceneDuplicates(supabase) : { groupsMerged: 0, rowsDeleted: 0 };
    const matchResults = await matchScenesToTmdb(supabase, offset);

    const summary = {
      matched: matchResults.filter((r) => r.outcome === 'matched').length,
      ambiguous: matchResults.filter((r) => r.outcome === 'ambiguous').length,
      unmatched: matchResults.filter((r) => r.outcome === 'unmatched').length,
      errored: matchResults.filter((r) => r.outcome === 'error').length,
    };

    logEvent({
      type: 'match_run',
      payload: {
        ...summary,
        merged: mergeResult.groupsMerged,
        duration_ms: Date.now() - startedAt,
        offset,
        batchSize: matchResults.length,
        error: null,
      },
    });

    return NextResponse.json({ merge: mergeResult, match: summary });
  } catch (err) {
    // A run killed by cron-job.org's own timeout never reaches the
    // logEvent above and leaves no trace at all -- but an error thrown
    // inside this route (as opposed to a hard timeout) previously 500'd
    // with no log either, unlike scrape-scene's per-branch try/catch.
    // Log what's known before returning the failure.
    logError('match-movies', err, { offset });
    logEvent({
      type: 'match_run',
      payload: {
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
        errored: 0,
        merged: 0,
        duration_ms: Date.now() - startedAt,
        offset,
        error: String(err).slice(0, 500),
      },
    });
    return NextResponse.json({ error: String(err).slice(0, 500) }, { status: 500 });
  }
}
