import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { SectionHeader } from '@/components/admin/SectionHeader';
import { StatTile } from '@/components/admin/StatTile';
import { LineChart, type LinePoint } from '@/components/admin/LineChart';

type DurationPayload = { duration_ms: number };
type FanoutPayload = {
  kind: 'showtime' | 'lineup_added' | 'lineup_removed' | 'new_release';
  recipientCount: number;
  notified: number;
  duration_ms: number;
};
type PruneRunPayload = { deleted: number; keepDays: number; duration_ms: number };

const FANOUT_KIND_LABELS: Record<FanoutPayload['kind'], string> = {
  showtime: 'Watchlist (poll)',
  lineup_added: 'Cinema lineup added',
  lineup_removed: 'Cinema lineup removed',
  new_release: 'New release',
};

// This page exists to answer "did the concurrency/pruning fixes from the
// scalability audit actually help" with real numbers, not just "the code
// changed and nothing broke" -- poll_run/match_run/welcome_email_run
// already logged duration_ms before those fixes landed, so their trend
// lines cover before-and-after for free. fanout_run is new (added
// alongside the concurrency fix itself), so it only has an "after" --
// there's no historical "before" data to compare against directly, only
// the synthetic stress-test numbers in docs/SCALABILITY_AUDIT.md.
export default async function AdminPerformancePage() {
  const supabase = createServiceRoleClient();

  const [
    { data: pollEvents },
    { data: matchEvents },
    { data: welcomeEvents },
    { data: fanoutEvents },
    { data: pruneEvents },
    { count: analyticsEventCount },
  ] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('occurred_at, payload')
      .eq('event_type', 'poll_run')
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('analytics_events')
      .select('occurred_at, payload')
      .eq('event_type', 'match_run')
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('analytics_events')
      .select('occurred_at, payload')
      .eq('event_type', 'welcome_email_run')
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('analytics_events')
      .select('occurred_at, payload')
      .eq('event_type', 'fanout_run')
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase
      .from('analytics_events')
      .select('occurred_at, payload')
      .eq('event_type', 'analytics_prune_run')
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabase.from('analytics_events').select('id', { count: 'exact', head: true }),
  ]);

  const pollPoints = toDurationPoints(pollEvents);
  const matchPoints = toDurationPoints(matchEvents);
  const welcomePoints = toDurationPoints(welcomeEvents);

  const fanoutRows = ((fanoutEvents ?? []) as { occurred_at: string; payload: FanoutPayload }[]).slice(0, 15);

  const pruneRows = (pruneEvents ?? []) as { occurred_at: string; payload: PruneRunPayload }[];
  const totalPruned = pruneRows.reduce((sum, r) => sum + r.payload.deleted, 0);
  const lastPrune = pruneRows[0];

  return (
    <AdminPageShell title="Performance">
      <section>
        <SectionHeader>Job run duration (most recent 30 runs, oldest to newest)</SectionHeader>
        <div className="flex flex-col gap-6">
          <ChartBlock title="Poll" points={pollPoints} />
          <ChartBlock title="Match movies" points={matchPoints} />
          <ChartBlock title="Welcome email" points={welcomePoints} />
        </div>
      </section>

      <section>
        <SectionHeader>Notification fan-out (concurrency effectiveness)</SectionHeader>
        <p className="mb-3 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Recipient count and wall-clock time per fan-out call, since the
          concurrency fix landed. A synthetic stress test (see
          docs/SCALABILITY_AUDIT.md) measured ~50 sequential recipients at
          ~50s versus ~5s at concurrency 10 -- these are the real numbers.
        </p>
        {fanoutRows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No fan-out runs logged yet -- this event type is new, so it
            only appears after the next watchlist notification, cinema
            lineup change, or new-release alert actually fires.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Kind</Th>
                <Th>Recipients</Th>
                <Th>Notified</Th>
                <Th>Duration</Th>
                <Th>Per recipient</Th>
              </tr>
            </thead>
            <tbody>
              {fanoutRows.map((row, i) => (
                <Tr key={i}>
                  <Td>{timeAgo(row.occurred_at)}</Td>
                  <Td>{FANOUT_KIND_LABELS[row.payload.kind] ?? row.payload.kind}</Td>
                  <Td>{row.payload.recipientCount}</Td>
                  <Td>{row.payload.notified}</Td>
                  <Td>{(row.payload.duration_ms / 1000).toFixed(2)}s</Td>
                  <Td>
                    {row.payload.recipientCount > 0
                      ? `${Math.round(row.payload.duration_ms / row.payload.recipientCount)}ms`
                      : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <SectionHeader>analytics_events table size</SectionHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Current row count" value={(analyticsEventCount ?? 0).toLocaleString()} />
          <StatTile
            label="Pruned (all logged runs)"
            value={totalPruned.toLocaleString()}
            sublabel={`${pruneRows.length} run${pruneRows.length === 1 ? '' : 's'} logged`}
          />
          <StatTile
            label="Last prune"
            value={lastPrune ? timeAgo(lastPrune.occurred_at) : 'Never'}
            sublabel={lastPrune ? `${lastPrune.payload.deleted} rows deleted` : 'prune-analytics job not yet run'}
            tone={lastPrune ? 'ok' : 'error'}
          />
        </div>
        {pruneRows.length > 0 && (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Deleted</Th>
                  <Th>Keep days</Th>
                  <Th>Duration</Th>
                </tr>
              </thead>
              <tbody>
                {pruneRows.map((row, i) => (
                  <Tr key={i}>
                    <Td>{timeAgo(row.occurred_at)}</Td>
                    <Td>{row.payload.deleted}</Td>
                    <Td>{row.payload.keepDays}</Td>
                    <Td>{(row.payload.duration_ms / 1000).toFixed(1)}s</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}

function toDurationPoints(rows: { occurred_at: string; payload: unknown }[] | null): LinePoint[] {
  return [...(rows ?? [])]
    .reverse() // fetched newest-first; the chart reads left-to-right as oldest-first
    .map((r) => ({
      label: new Date(r.occurred_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      value: Math.round(((r.payload as DurationPayload).duration_ms ?? 0) / 1000),
    }));
}

function ChartBlock({ title, points }: { title: string; points: LinePoint[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
        {title} (seconds)
      </p>
      {points.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No runs logged yet.
        </p>
      ) : (
        <LineChart points={points} />
      )}
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="admin-table-row rounded-md transition-colors">{children}</tr>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="border-b px-3 pb-2.5 text-xs font-semibold tracking-wide uppercase"
      style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
      {children}
    </td>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((new Date().getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
