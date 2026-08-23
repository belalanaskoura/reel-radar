import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listAllUsers } from '@/lib/list-all-users';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { SectionHeader } from '@/components/admin/SectionHeader';
import { StatTile } from '@/components/admin/StatTile';
import { LineChart, type LinePoint } from '@/components/admin/LineChart';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { UserIcon } from '@/components/icons';

type PageViewPayload = { path: string; movie_id?: string; branch_id?: string };

export default async function AdminUsagePage() {
  const supabase = createServiceRoleClient();
  const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: dauEvents },
    { data: pageViews },
    { data: signups },
    { data: watchlistAdds },
    allUsers,
    { data: pushRows },
    { count: watchlistTotal },
    { count: cinemaFollowTotal },
  ] = await Promise.all([
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
    // Total user count and the recent-signups list both need the real
    // auth.users table, not analytics_events -- that table only has
    // events logged since instrumentation was added, so it would miss
    // anyone who signed up before that and can't answer "how many users
    // are there, total" at all.
    listAllUsers(supabase),
    // user_id only -- a user can have several rows (one per device), so
    // "how many people have push enabled" is the distinct user_id count,
    // not the raw row count. Same pattern as /admin/broadcast.
    supabase.from('push_subscriptions').select('user_id'),
    supabase.from('watchlist').select('user_id', { count: 'exact', head: true }),
    supabase.from('cinema_follows').select('user_id', { count: 'exact', head: true }),
  ]);

  const pushEnabledUserIds = new Set((pushRows ?? []).map((r) => r.user_id));
  const pushEnabledCount = allUsers.filter((u) => pushEnabledUserIds.has(u.id)).length;

  const recentSignups = [...allUsers]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);
  const recentSignupIds = recentSignups.map((u) => u.id);
  const { data: recentProfiles } = recentSignupIds.length > 0
    ? await supabase.from('profiles').select('id, display_name').in('id', recentSignupIds)
    : { data: [] };
  const displayNameById = new Map(
    (recentProfiles ?? []).map((p) => [p.id as string, p.display_name as string | null]),
  );

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
        <SectionHeader>Overview</SectionHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total users" value={allUsers.length} />
          <StatTile
            label="Push enabled"
            value={pushEnabledCount}
            sublabel={
              allUsers.length > 0
                ? `${Math.round((pushEnabledCount / allUsers.length) * 100)}% of users`
                : undefined
            }
          />
          <StatTile label="Watchlist items" value={watchlistTotal ?? 0} />
          <StatTile label="Tracked cinemas" value={cinemaFollowTotal ?? 0} />
        </div>
      </section>

      <section>
        <SectionHeader>Daily active users (30 days) — signup or watchlist_add events</SectionHeader>
        {dauPoints.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No activity logged yet.
          </p>
        ) : (
          <LineChart points={dauPoints} />
        )}
      </section>

      <section>
        <CollapsibleSection
          title="Recent signups"
          description={`${recentSignups.length} most recent`}
          icon={<UserIcon size={20} />}
        >
          {recentSignups.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
              No signups yet.
            </p>
          ) : (
            <ol className="flex flex-col">
              {recentSignups.map((u) => (
                <RankedRow key={u.id}>
                  <span className="min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                    {displayNameById.get(u.id) || u.email || u.id}
                  </span>
                  <span className="shrink-0" style={{ color: 'var(--ink-dim)' }}>
                    {new Date(u.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </RankedRow>
              ))}
            </ol>
          )}
        </CollapsibleSection>
      </section>

      <section>
        <SectionHeader>Growth (30 days)</SectionHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Signups" value={signups?.length ?? 0} />
          <StatTile label="Watchlist adds" value={watchlistAdds?.length ?? 0} />
        </div>
      </section>

      <section>
        <SectionHeader>Top viewed movies (7 days)</SectionHeader>
        {topMovieIds.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No page views logged yet.
          </p>
        ) : (
          <ol className="flex flex-col">
            {topMovieIds.map(([id, count], i) => (
              <RankedRow key={id}>
                <span style={{ color: 'var(--ink)' }}>
                  <span style={{ color: 'var(--ink-dim)' }}>{i + 1}.</span>{' '}
                  <Link href={`/movies/${id}`} className="underline underline-offset-2" style={{ color: 'var(--accent-dim)' }}>
                    {movieTitleById.get(id) ?? id}
                  </Link>
                </span>
                <span style={{ color: 'var(--ink-dim)' }}>
                  {count} view{count === 1 ? '' : 's'}
                </span>
              </RankedRow>
            ))}
          </ol>
        )}
      </section>

      <section>
        <SectionHeader>Top viewed cinemas (7 days)</SectionHeader>
        {topBranchIds.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No page views logged yet.
          </p>
        ) : (
          <ol className="flex flex-col">
            {topBranchIds.map(([id, count], i) => (
              <RankedRow key={id}>
                <span style={{ color: 'var(--ink)' }}>
                  <span style={{ color: 'var(--ink-dim)' }}>{i + 1}.</span>{' '}
                  <Link href={`/cinemas/${id}`} className="underline underline-offset-2" style={{ color: 'var(--accent-dim)' }}>
                    {branchNameById.get(id) ?? id}
                  </Link>
                </span>
                <span style={{ color: 'var(--ink-dim)' }}>
                  {count} view{count === 1 ? '' : 's'}
                </span>
              </RankedRow>
            ))}
          </ol>
        )}
      </section>
    </AdminPageShell>
  );
}

// Plain rows separated by a hairline instead of each its own bordered
// box -- a ranked top-10 list read as ten stacked cards before, more
// noise than a scannable list needs.
function RankedRow({ children }: { children: React.ReactNode }) {
  return (
    <li
      className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
      style={{ borderColor: 'var(--rule)' }}
    >
      {children}
    </li>
  );
}
