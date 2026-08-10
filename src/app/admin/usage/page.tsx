import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { StatTile } from '@/components/admin/StatTile';
import { LineChart, type LinePoint } from '@/components/admin/LineChart';

type PageViewPayload = { path: string; movie_id?: string; branch_id?: string };

export default async function AdminUsagePage() {
  const supabase = createServiceRoleClient();
  const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: dauEvents }, { data: pageViews }, { data: signups }, { data: watchlistAdds }] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('occurred_at, payload')
      .in('event_type', ['signup', 'watchlist_add'])
      .gte('occurred_at', thirtyDaysAgo),
    supabase
      .from('analytics_events')
      .select('payload')
      .eq('event_type', 'page_view')
      .gte('occurred_at', sevenDaysAgo),
    supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_type', 'signup').gte('occurred_at', thirtyDaysAgo),
    supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_type', 'watchlist_add').gte('occurred_at', thirtyDaysAgo),
  ]);

  // DAU per day: distinct user_id per day across signup/watchlist_add.
  const usersByDay = new Map<string, Set<string>>();
  for (const row of dauEvents ?? []) {
    const day = new Date(row.occurred_at).toISOString().slice(0, 10);
    const uid = (row.payload as { user_id?: string }).user_id;
    if (!uid) continue;
    const set = usersByDay.get(day) ?? new Set<string>();
    set.add(uid);
    usersByDay.set(day, set);
  }
  const dauPoints: LinePoint[] = [...usersByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, users]) => ({
      label: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: users.size,
    }));

  // Top movies/cinemas by page_view count over the last 7 days.
  const movieCounts = new Map<string, number>();
  const branchCounts = new Map<string, number>();
  for (const row of pageViews ?? []) {
    const p = row.payload as PageViewPayload;
    if (p.movie_id) movieCounts.set(p.movie_id, (movieCounts.get(p.movie_id) ?? 0) + 1);
    if (p.branch_id) branchCounts.set(p.branch_id, (branchCounts.get(p.branch_id) ?? 0) + 1);
  }
  const topMovieIds = [...movieCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topBranchIds = [...branchCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const [{ data: movieTitles }, { data: branchNames }] = await Promise.all([
    topMovieIds.length > 0
      ? supabase.from('movies').select('id, title').in('id', topMovieIds.map(([id]) => id))
      : Promise.resolve({ data: [] }),
    topBranchIds.length > 0
      ? supabase.from('branches').select('id, name').in('id', topBranchIds.map(([id]) => id))
      : Promise.resolve({ data: [] }),
  ]);
  const movieTitleById = new Map((movieTitles ?? []).map((m) => [m.id, m.title]));
  const branchNameById = new Map((branchNames ?? []).map((b) => [b.id, b.name]));

  return (
    <AdminPageShell title="Usage">
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Daily active users (30 days) — signup or watchlist_add events
        </h2>
        {dauPoints.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No activity logged yet.
          </p>
        ) : (
          <LineChart points={dauPoints} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Growth (30 days)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="Signups" value={signups?.length ?? 0} />
          <StatTile label="Watchlist adds" value={watchlistAdds?.length ?? 0} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Top viewed movies (7 days)
        </h2>
        {topMovieIds.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No page views logged yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {topMovieIds.map(([id, count], i) => (
              <li key={id} className="flex items-center justify-between rounded-sm border px-3 py-2 text-sm" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
                <span style={{ color: 'var(--ink)' }}>
                  {i + 1}.{' '}
                  <Link href={`/movies/${id}`} className="underline" style={{ color: 'var(--accent-dim)' }}>
                    {movieTitleById.get(id) ?? id}
                  </Link>
                </span>
                <span style={{ color: 'var(--ink-dim)' }}>
                  {count} view{count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Top viewed cinemas (7 days)
        </h2>
        {topBranchIds.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No page views logged yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {topBranchIds.map(([id, count], i) => (
              <li key={id} className="flex items-center justify-between rounded-sm border px-3 py-2 text-sm" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
                <span style={{ color: 'var(--ink)' }}>
                  {i + 1}.{' '}
                  <Link href={`/cinemas/${id}`} className="underline" style={{ color: 'var(--accent-dim)' }}>
                    {branchNameById.get(id) ?? id}
                  </Link>
                </span>
                <span style={{ color: 'var(--ink-dim)' }}>
                  {count} view{count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AdminPageShell>
  );
}
