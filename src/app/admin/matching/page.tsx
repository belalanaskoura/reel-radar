import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { StatTile } from '@/components/admin/StatTile';

type MatchRunPayload = { matched: number; ambiguous: number; unmatched: number; merged: number; duration_ms: number };
type SyncRunPayload = { accepted: number; rejected: number; duration_ms: number };

export default async function AdminMatchingPage() {
  const supabase = createServiceRoleClient();

  const [{ data: matchEvents }, { data: syncEvents }, { data: backlogMovies }] = await Promise.all([
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
      .from('movies')
      .select('id, title, match_status, created_at')
      .in('match_status', ['unmatched', 'ambiguous'])
      .order('created_at', { ascending: true })
      .limit(50),
  ]);

  const latestMatch = matchEvents?.[0]?.payload as MatchRunPayload | undefined;
  const latestSync = syncEvents?.[0]?.payload as SyncRunPayload | undefined;

  return (
    <AdminPageShell title="Matching">
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Latest match run
        </h2>
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
          <div className="overflow-x-auto rounded-sm border" style={{ borderColor: 'var(--rule)' }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Since</Th>
                </tr>
              </thead>
              <tbody>
                {backlogMovies.map((movie) => (
                  <tr key={movie.id} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                    <Td>
                      <Link href={`/movies/${movie.id}`} className="underline" style={{ color: 'var(--accent-dim)' }}>
                        {movie.title}
                      </Link>
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--error-ink)' }}>{movie.match_status}</span>
                    </Td>
                    <Td>{timeAgo(movie.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
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
