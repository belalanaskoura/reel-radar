import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { StatTile } from '@/components/admin/StatTile';
import { RunJobButton } from '@/components/admin/RunJobButton';
import { ResolveMatchPanel } from '@/components/admin/ResolveMatchPanel';

type MatchRunPayload = { matched: number; ambiguous: number; unmatched: number; merged: number; duration_ms: number };
type SyncRunPayload = { accepted: number; rejected: number; duration_ms: number };
type DigestRunPayload = { issues: number; emailSent: boolean; pushSent: number; duration_ms: number };

export default async function AdminMatchingPage() {
  const supabase = createServiceRoleClient();

  const [{ data: matchEvents }, { data: syncEvents }, { data: digestEvents }, { data: backlogMovies }] =
    await Promise.all([
      supabase
        .from('analytics_events')
        .select('occurred_at, payload')
        .eq('event_type', 'match_run')
        .order('occurred_at', { ascending: false })
        .limit(20),
      supabase
        .from('analytics_events')
        .select('occurred_at, payload')
        .eq('event_type', 'sync_run')
        .order('occurred_at', { ascending: false })
        .limit(10),
      supabase
        .from('analytics_events')
        .select('occurred_at, payload')
        .eq('event_type', 'admin_digest_run')
        .order('occurred_at', { ascending: false })
        .limit(1),
      supabase
        .from('movies')
        .select('id, title, match_status, created_at')
        .in('match_status', ['unmatched', 'ambiguous'])
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

  const latestMatch = matchEvents?.[0]?.payload as MatchRunPayload | undefined;
  const latestSync = syncEvents?.[0]?.payload as SyncRunPayload | undefined;
  const latestDigest = digestEvents?.[0]?.payload as DigestRunPayload | undefined;
  const latestDigestAt = digestEvents?.[0]?.occurred_at as string | undefined;

  return (
    <AdminPageShell title="Matching">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Latest match run
          </h2>
          <RunJobButton
            job="match-movies"
            size="sm"
            label="Re-run matching"
            confirmText="Re-run the matching job now? This tries to resolve the current unmatched/ambiguous backlog."
          />
        </div>
        {latestMatch ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Matched" value={latestMatch.matched} tone="ok" />
            <StatTile
              label="Ambiguous"
              value={latestMatch.ambiguous}
              tone={latestMatch.ambiguous > 0 ? 'error' : 'neutral'}
            />
            <StatTile
              label="Unmatched"
              value={latestMatch.unmatched}
              tone={latestMatch.unmatched > 0 ? 'error' : 'neutral'}
            />
            <StatTile label="Merged duplicates" value={latestMatch.merged} />
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No match runs logged yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Latest sync (Egypt-release filter)
        </h2>
        {latestSync ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile label="Accepted" value={latestSync.accepted} tone="ok" />
            <StatTile label="Rejected" value={latestSync.rejected} />
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No sync runs logged yet.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Data quality digest
          </h2>
          <RunJobButton
            job="admin-digest"
            size="sm"
            label="Run digest now"
            confirmText="Run the data quality digest now? This emails/pushes a summary of missing posters, unresolved matches, and movies with no synopsis, if there are any."
          />
        </div>
        {latestDigest ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile
              label="Issues found"
              value={latestDigest.issues}
              tone={latestDigest.issues > 0 ? 'error' : 'ok'}
              sublabel={latestDigestAt ? timeAgo(latestDigestAt) : undefined}
            />
            <StatTile
              label="Email"
              value={latestDigest.issues === 0 ? 'n/a' : latestDigest.emailSent ? 'Sent' : 'Not sent'}
              tone={latestDigest.issues === 0 ? 'neutral' : latestDigest.emailSent ? 'ok' : 'error'}
            />
            <StatTile
              label="Push"
              value={latestDigest.issues === 0 ? 'n/a' : latestDigest.pushSent}
              tone={latestDigest.issues === 0 ? 'neutral' : latestDigest.pushSent > 0 ? 'ok' : 'error'}
            />
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No digest runs logged yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Match run history
        </h2>
        {!matchEvents || matchEvents.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No match runs logged yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border" style={{ borderColor: 'var(--rule)' }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}>
                  <Th>When</Th>
                  <Th>Matched</Th>
                  <Th>Ambiguous</Th>
                  <Th>Unmatched</Th>
                  <Th>Merged</Th>
                </tr>
              </thead>
              <tbody>
                {matchEvents.map((row, i) => {
                  const p = row.payload as MatchRunPayload;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                      <Td>{timeAgo(row.occurred_at)}</Td>
                      <Td>{p.matched}</Td>
                      <Td>{p.ambiguous}</Td>
                      <Td>{p.unmatched}</Td>
                      <Td>{p.merged}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Backlog — needs manual attention
        </h2>
        {!backlogMovies || backlogMovies.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ok-ink)' }}>
            Nothing unmatched or ambiguous right now.
          </p>
        ) : (
          // A card per movie, not a table -- ResolveMatchPanel expands
          // into a candidate grid + collapsible id-search section that
          // needs real width to be usable on a phone, which a table
          // squeezed into one <td> inside overflow-x-auto can't give it.
          <div className="flex flex-col gap-3">
            {backlogMovies.map((movie) => (
              <div
                key={movie.id}
                className="flex flex-col gap-3 rounded-sm border p-3"
                style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Link
                    href={`/movies/${movie.id}`}
                    className="text-sm font-medium underline"
                    style={{ color: 'var(--accent-dim)' }}
                  >
                    {movie.title}
                  </Link>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ink-dim)' }}>
                    <span style={{ color: 'var(--error-ink)' }}>{movie.match_status}</span>
                    <span>{timeAgo(movie.created_at)}</span>
                  </div>
                </div>
                <ResolveMatchPanel movieId={movie.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-xs font-semibold tracking-wide uppercase">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
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
