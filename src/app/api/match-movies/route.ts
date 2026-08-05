import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { mergeSceneDuplicates } from '@/lib/matching/merge-scene-duplicates';
import { matchScenesToTmdb } from '@/lib/matching/match-to-tmdb';

// Reconciles Scene-sourced placeholder movies (created by Phase 4's
// scraper, tmdb_id null) against TMDB. Two steps: first merge duplicate
// placeholders that represent the same movie listed on both branches,
// then match each remaining Scene movie to a real TMDB entry (or flag it
// ambiguous/unmatched for manual review; never guess).
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const mergeResult = await mergeSceneDuplicates(supabase);
  const matchResults = await matchScenesToTmdb(supabase);

  const summary = {
    matched: matchResults.filter((r) => r.outcome === 'matched').length,
    ambiguous: matchResults.filter((r) => r.outcome === 'ambiguous').length,
    unmatched: matchResults.filter((r) => r.outcome === 'unmatched').length,
  };

  return NextResponse.json({ merge: mergeResult, match: summary });
}
