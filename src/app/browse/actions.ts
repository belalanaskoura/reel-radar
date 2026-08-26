'use server';

import { createClient } from '@/lib/supabase/server';
import type { MovieCardData } from '@/components/MovieCard';

// Word-start matching, kept byte-identical to BrowseGrid.tsx's own
// matchesSearch -- the two must never drift, since this is only ever
// reached when the client-side version already came up empty against a
// truncated fetch (see browse/page.tsx's BROWSE_FETCH_LIMIT comment).
function matchesSearch(title: string, query: string): boolean {
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return true;
  const titleWords = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return queryWords.every((qWord) => titleWords.some((tWord) => tWord.startsWith(qWord)));
}

// Rare fallback for a search that comes up empty against /browse's
// initial, deliberately-bounded fetch (BROWSE_FETCH_LIMIT) -- covers a
// movie that exists in the catalog but landed outside that window. Not
// called on every keystroke: BrowseGrid only fires this once local
// filtering finds nothing and the initial fetch was truncated, and only
// after the user has stopped typing for a beat.
//
// A coarse ilike pre-filter on the first query word narrows what
// Postgres has to send back; the real word-start-per-word match
// (matchesSearch above) still runs in JS afterward, since expressing it
// as a single SQL predicate would risk drifting from BrowseGrid's real
// logic. movies/showtimes_cache/branches are all publicly readable (see
// their RLS policies), so this doesn't need a service-role client.
export async function getFullCatalogSearchResults(query: string): Promise<MovieCardData[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const firstWord = trimmed.toLowerCase().split(/\s+/)[0];
  const supabase = await createClient();

  const { data: movies } = await supabase
    .from('movies')
    .select(
      'id, title, release_date, poster_path, showtimes_cache(branch_id, bookable, raw_showtimes, branches(name))',
    )
    .in('match_status', ['matched', 'unmatched', 'ambiguous'])
    .ilike('title', `%${firstWord}%`)
    .limit(200);

  return (movies ?? [])
    .filter((m) => matchesSearch(m.title, trimmed))
    .map((m) => ({
      id: m.id,
      title: m.title,
      release_date: m.release_date,
      poster_path: m.poster_path,
      branches: (m.showtimes_cache ?? []).map((s) => ({
        branch_id: s.branch_id,
        branch_name: (s.branches as unknown as { name: string } | null)?.name ?? '',
        bookable: s.bookable,
        bookableDayCount: Array.isArray(s.raw_showtimes) ? s.raw_showtimes.length : 0,
      })),
    }));
}
