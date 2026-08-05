import { createClient } from '@/lib/supabase/server';
import { BrowseGrid } from '@/components/BrowseGrid';
import { NtfyBanner } from '@/components/NtfyBanner';
import type { MovieCardData } from '@/components/MovieCard';

export default async function BrowsePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetches every browsable movie once: search, the status filter, and
  // pagination all run client-side against this full set, so typing
  // filters instantly with no network round-trip per keystroke. Limit
  // raised well past the catalog's current size now that sync-movies
  // pulls through end of 2029 instead of 6 months out.
  const { data: movies } = await supabase
    .from('movies')
    .select('id, title, release_date, poster_path, showtimes_cache(bookable, raw_showtimes, branches(name))')
    .in('match_status', ['matched', 'unmatched'])
    .order('release_date', { ascending: true, nullsFirst: false })
    .limit(2000);

  let watchedIds: string[] = [];
  let showNtfyBanner = false;
  if (user) {
    const { data: watchlistRows } = await supabase
      .from('watchlist')
      .select('movie_id')
      .eq('user_id', user.id);
    watchedIds = (watchlistRows ?? []).map((r) => r.movie_id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('ntfy_topic')
      .eq('id', user.id)
      .single();
    showNtfyBanner = !profile?.ntfy_topic;
  }

  const movieCards: MovieCardData[] = (movies ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    release_date: m.release_date,
    poster_path: m.poster_path,
    branches: (m.showtimes_cache ?? []).map((s) => ({
      branch_name: (s.branches as unknown as { name: string } | null)?.name ?? '',
      bookable: s.bookable,
      bookableDayCount: Array.isArray(s.raw_showtimes) ? s.raw_showtimes.length : 0,
    })),
  }));

  return (
    <main>
      <div
        className="relative overflow-hidden border-b"
        style={{ borderColor: 'var(--rule)' }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <h1
            className="font-display mb-2 text-4xl leading-none sm:text-6xl"
            style={{ color: 'var(--ink)' }}
          >
            Now booking <span style={{ color: 'var(--accent)' }}>&amp; on the way</span>
          </h1>
          <p className="max-w-xl text-sm sm:text-base" style={{ color: 'var(--ink-dim)' }}>
            Everything bookable right now at Cairo Festival City and District 5, plus movies
            headed there that haven&apos;t opened yet. Watchlist one before it&apos;s even
            listed and get notified the moment tickets go live.
          </p>
        </div>
      </div>

      {showNtfyBanner && (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
          <NtfyBanner />
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <BrowseGrid movies={movieCards} watchedIds={watchedIds} isSignedIn={!!user} />
      </div>
    </main>
  );
}
