import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { StatTile } from '@/components/admin/StatTile';
import { RunJobButton } from '@/components/admin/RunJobButton';
import { RunAllJobsButton, type JobTarget } from '@/components/admin/RunAllJobsButton';
import { findCheapDataQualityIssues } from '@/lib/matching/data-quality';

// A movie/branch pair not re-checked in roughly 2 poll cycles is worth
// flagging -- the external scheduler runs poll every 15-30 min, so 90 min
// gives real slack for a slow run without staying silent through a
// genuine outage (the kind that produced the ~16.5-hour stale-cache gap
// this dashboard exists to catch next time). VOX branches are scraped
// once daily, not on Scene's ~30 min cadence (see scrape-vox's own file
// comment on why -- elCinema has no cheap bookability-only check, so
// it's a full-detail fetch every run, too expensive to run as often as
// Scene) -- flagging them stale on the same 1.5h threshold as Scene
// would mark every VOX branch stale for most of every day, which isn't
// a real problem, just noise from applying the wrong cadence.
const STALE_THRESHOLD_HOURS: Record<'scene' | 'vox', number> = {
  scene: 1.5,
  vox: 24,
};
const WIDEST_STALE_THRESHOLD_HOURS = Math.max(...Object.values(STALE_THRESHOLD_HOURS));

type EventRow = { event_type: string; occurred_at: string; payload: Record<string, unknown> };

export default async function AdminOverviewPage() {
  const supabase = createServiceRoleClient();
  const now = new Date();
  // Widest threshold in the query itself (VOX's 24h), then each row is
  // checked against its own chain's real threshold below -- a single
  // fixed cutoff can't apply two different thresholds by chain.
  const staleCutoff = new Date(now.getTime() - WIDEST_STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: staleRows },
    { count: unmatchedCount },
    { count: oldUnmatchedCount },
    { data: deliveries24h },
    { data: recentRunEvents },
    { data: signupEvents },
    { data: watchlistEvents },
    { count: recentSignIns },
    dataQualityIssues,
  ] = await Promise.all([
    // No DB-side .limit() here: the query window is widened to the
    // largest per-chain threshold (VOX's 24h), so a hard limit here
    // could fill up on rows that are stale-for-Scene's-threshold but
    // not actually stale yet, crowding out real staleness elsewhere.
    // Filtered down to each row's real chain-specific threshold and
    // capped for display after the query, below.
    supabase
      .from('showtimes_cache')
      .select('movie_id, branch_id, last_checked_at, movies(title), branches(name, chain)')
      .lt('last_checked_at', staleCutoff)
      .order('last_checked_at', { ascending: true }),
    supabase
      .from('movies')
      .select('id', { count: 'exact', head: true })
      .in('match_status', ['unmatched', 'ambiguous']),
    supabase
      .from('movies')
      .select('id', { count: 'exact', head: true })
      .in('match_status', ['unmatched', 'ambiguous'])
      .lt('created_at', sevenDaysAgo),
    supabase
      .from('notification_deliveries')
      .select('channel, success')
      .gte('created_at', oneDayAgo),
    supabase
      .from('analytics_events')
      .select('event_type, occurred_at, payload')
      .in('event_type', ['poll_run', 'scrape_run', 'match_run'])
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabase
      .from('analytics_events')
      .select('payload')
      .eq('event_type', 'signup')
      .gte('occurred_at', thirtyDaysAgo),
    supabase
      .from('analytics_events')
      .select('payload')
      .eq('event_type', 'watchlist_add')
      .gte('occurred_at', thirtyDaysAgo),
    // Sign-in-derived DAU proxy -- Supabase Auth already tracks this, no
    // new instrumentation needed for it specifically.
    (async () => {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error || !data) return { count: 0 };
      const count = data.users.filter(
        (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) > new Date(oneDayAgo),
      ).length;
      return { count };
    })(),
    // Cheap-only data quality checks (no poster, stuck backlog) -- safe
    // on every dashboard load since both are plain column queries; the
    // TMDB-calling "no synopsis" check stays digest-only, see
    // src/lib/matching/data-quality.ts.
    findCheapDataQualityIssues(supabase),
  ]);

  // Each row checked against its own chain's real threshold (the query
  // above only narrowed to the widest one). actuallyStaleRows is the
  // full filtered set (used for the re-scrape buttons below, so every
  // genuinely stale branch gets one, not just whichever made the
  // display cap); staleRowsToShow caps it to 10 for the list, oldest
  // (most stale) first, the same cap the old DB-side .limit() gave.
  const actuallyStaleRows = (staleRows ?? []).filter((row) => {
    const branch = row.branches as unknown as { chain: string } | null;
    const chain = branch?.chain === 'vox' ? 'vox' : 'scene';
    const cutoff = now.getTime() - STALE_THRESHOLD_HOURS[chain] * 60 * 60 * 1000;
    return new Date(row.last_checked_at).getTime() < cutoff;
  });
  const staleRowsToShow = actuallyStaleRows.slice(0, 10);

  const deliveryStats = (['email', 'push'] as const).map((channel) => {
    const rows = (deliveries24h ?? []).filter((d) => d.channel === channel);
    const successCount = rows.filter((d) => d.success).length;
    return { channel, total: rows.length, successCount };
  });

  // Most recent event of each kind, keyed by a stable identity per source
  // (poll has one, scrape has one per branch, match has one) -- this is a
  // "did the last run of each job succeed" strip, not a full history.
  const latestByKey = new Map<string, EventRow>();
  for (const row of (recentRunEvents ?? []) as EventRow[]) {
    const key =
      row.event_type === 'scrape_run'
        ? `scrape_run:${row.payload.source}:${row.payload.branch}`
        : row.event_type;
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }

  // Distinct stale branches, so the fix-it row offers one button per
  // affected branch rather than one per stale movie row.
  const staleBranches = new Map<string, { name: string; chain: string }>();
  for (const row of actuallyStaleRows) {
    const branch = row.branches as unknown as { name: string; chain: string } | null;
    if (branch) staleBranches.set(row.branch_id, branch);
  }

  const eventDauUserIds = new Set<string>();
  for (const row of signupEvents ?? []) {
    const uid = (row.payload as { user_id?: string }).user_id;
    if (uid) eventDauUserIds.add(uid);
  }
  for (const row of watchlistEvents ?? []) {
    const uid = (row.payload as { user_id?: string }).user_id;
    if (uid) eventDauUserIds.add(uid);
  }

  return (
    <AdminPageShell title="Admin">
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Cache health
        </h2>
        <div
          className="rounded-sm border p-4"
          style={
            actuallyStaleRows.length > 0
              ? { borderColor: 'var(--error-ink)', background: 'var(--error-bg)' }
              : { borderColor: 'var(--rule)', background: 'var(--surface)' }
          }
        >
          <p
            className="font-display text-2xl leading-none"
            style={{ color: actuallyStaleRows.length > 0 ? 'var(--error-ink)' : 'var(--ok-ink)' }}
          >
            {actuallyStaleRows.length} stale {actuallyStaleRows.length === 1 ? 'row' : 'rows'}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-dim)' }}>
            Not re-checked in over {STALE_THRESHOLD_HOURS.scene}h (Scene) or {STALE_THRESHOLD_HOURS.vox}h (VOX)
          </p>
          {staleBranches.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {staleBranches.size > 1 && (
                <RunAllJobsButton
                  targets={[...staleBranches.entries()].map(
                    ([branchId, branch]): JobTarget => ({
                      job: branch.chain === 'vox' ? 'scrape-vox' : 'scrape-scene',
                      branch: branchId,
                      label: branch.name,
                    }),
                  )}
                  size="sm"
                  label={`Re-scrape all (${staleBranches.size})`}
                  confirmText={`Re-run the scrape for all ${staleBranches.size} stale cinemas now? This runs one after another, not all at once.`}
                />
              )}
              {[...staleBranches.entries()].map(([branchId, branch]) => (
                <RunJobButton
                  key={branchId}
                  job={branch.chain === 'vox' ? 'scrape-vox' : 'scrape-scene'}
                  branch={branchId}
                  size="sm"
                  label={`Re-scrape ${branch.name}`}
                  confirmText={`Re-run the scrape for ${branch.name} now?`}
                />
              ))}
            </div>
          )}
          {staleRowsToShow.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm" style={{ color: 'var(--ink)' }}>
              {staleRowsToShow.map((row) => {
                const movie = row.movies as unknown as { title: string } | null;
                const branch = row.branches as unknown as { name: string } | null;
                const hoursStale = Math.round(
                  (now.getTime() - new Date(row.last_checked_at).getTime()) / (60 * 60 * 1000),
                );
                return (
                  <li key={`${row.movie_id}:${row.branch_id}`}>
                    {movie?.title ?? row.movie_id} &middot; {branch?.name ?? row.branch_id} &middot;{' '}
                    {hoursStale}h stale
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {dataQualityIssues.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Data quality
          </h2>
          <div
            className="rounded-sm border p-4"
            style={{ borderColor: 'var(--error-ink)', background: 'var(--error-bg)' }}
          >
            <p className="font-display text-2xl leading-none" style={{ color: 'var(--error-ink)' }}>
              {dataQualityIssues.length} issue{dataQualityIssues.length === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-dim)' }}>
              {dataQualityIssues.filter((i) => i.kind === 'no_poster').length} missing poster,{' '}
              {dataQualityIssues.filter((i) => i.kind === 'stuck_backlog').length} stuck unmatched/ambiguous
            </p>
            <Link
              href="/admin/matching"
              className="mt-3 inline-block text-xs font-semibold underline"
              style={{ color: 'var(--error-ink)' }}
            >
              Review in Matching →
            </Link>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Matching backlog
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile
            label="Unmatched / ambiguous"
            value={unmatchedCount ?? 0}
            tone={unmatchedCount && unmatchedCount > 0 ? 'error' : 'ok'}
          />
          <StatTile
            label="Older than 7 days"
            value={oldUnmatchedCount ?? 0}
            sublabel="of the backlog above"
            tone={oldUnmatchedCount && oldUnmatchedCount > 0 ? 'error' : 'neutral'}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Notification delivery (24h)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {deliveryStats.map(({ channel, total, successCount }) => {
            const rate = total > 0 ? Math.round((successCount / total) * 100) : null;
            return (
              <StatTile
                key={channel}
                label={channel === 'email' ? 'Email success' : 'Push success'}
                value={rate === null ? 'No sends' : `${rate}%`}
                sublabel={total > 0 ? `${successCount} / ${total} sent` : undefined}
                tone={rate === null ? 'neutral' : rate < 90 ? 'error' : 'ok'}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Last run status
        </h2>
        <div className="flex flex-col gap-2">
          {latestByKey.size === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
              No job runs logged yet.
            </p>
          ) : (
            [...latestByKey.entries()].map(([key, row]) => <RunStatusRow key={key} row={row} now={now} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Active users
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile
            label="Signed in (24h)"
            value={recentSignIns ?? 0}
            sublabel="via auth.users.last_sign_in_at"
          />
          <StatTile
            label="Did something (30d)"
            value={eventDauUserIds.size}
            sublabel="signup or watchlist_add events"
          />
        </div>
      </section>
    </AdminPageShell>
  );
}

function RunStatusRow({ row, now }: { row: EventRow; now: Date }) {
  const minutesAgo = Math.round((now.getTime() - new Date(row.occurred_at).getTime()) / 60000);
  const timeSince = minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.round(minutesAgo / 60)}h ago`;

  const hasError =
    row.event_type === 'scrape_run'
      ? !!row.payload.error
      : row.event_type === 'poll_run'
        ? (row.payload.pair_errors as number) > 0
        : false;

  const label =
    row.event_type === 'scrape_run'
      ? `Scrape (${row.payload.source} / ${row.payload.branch})`
      : row.event_type === 'poll_run'
        ? 'Poll'
        : 'Match';

  const runJobProps: { job: 'scrape-scene' | 'scrape-vox' | 'poll' | 'match-movies'; branch?: string } | null =
    row.event_type === 'scrape_run'
      ? {
          job: row.payload.source === 'vox' ? 'scrape-vox' : 'scrape-scene',
          branch: row.payload.branch as string,
        }
      : row.event_type === 'poll_run'
        ? { job: 'poll' }
        : row.event_type === 'match_run'
          ? { job: 'match-movies' }
          : null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-sm border px-4 py-2.5"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: hasError ? 'var(--error-ink)' : 'var(--ok-ink)' }}
          aria-hidden="true"
        />
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {label}
        </span>
        <span className="text-xs" style={{ color: 'var(--ink-dim)' }}>
          {timeSince}
        </span>
      </div>
      {runJobProps && (
        <RunJobButton
          {...runJobProps}
          size="sm"
          label="Run now"
          confirmText={`Manually re-run ${label} now?`}
        />
      )}
    </div>
  );
}
