import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { SectionHeader } from '@/components/admin/SectionHeader';
import { ScrapeRunsTable, type ScrapeRunPayload } from '@/components/admin/ScrapeRunsTable';

type PollRunPayload = {
  checked: number;
  notified: number;
  pair_errors: number;
  duration_ms: number;
};

type DelistRunPayload = {
  branch: string;
  listed: number;
  delisted: number;
  duration_ms: number;
  error: string | null;
};

// No ?branch= param anymore -- the branch filter lives entirely
// client-side in ScrapeRunsTable now (see its own comment for why: the
// old URL-param version re-ran every query on this page per click, even
// the 3 that don't depend on branch at all).
export default async function AdminScrapersPage() {
  const supabase = createServiceRoleClient();

  const [{ data: branches }, { data: scrapeEvents }, { data: pollEvents }, { data: delistEvents }] =
    await Promise.all([
      supabase.from('branches').select('id, name').order('id', { ascending: true }),
      supabase
        .from('analytics_events')
        .select('occurred_at, payload')
        .eq('event_type', 'scrape_run')
        .order('occurred_at', { ascending: false })
        .limit(100),
      supabase
        .from('analytics_events')
        .select('occurred_at, payload')
        .eq('event_type', 'poll_run')
        .order('occurred_at', { ascending: false })
        .limit(30),
      supabase
        .from('analytics_events')
        .select('occurred_at, payload')
        .eq('event_type', 'scrape_delist_run')
        .order('occurred_at', { ascending: false })
        .limit(30),
    ]);

  return (
    <AdminPageShell title="Scrapers">
      <ScrapeRunsTable
        branches={branches ?? []}
        events={(scrapeEvents ?? []) as { occurred_at: string; payload: ScrapeRunPayload }[]}
      />

      <section>
        <SectionHeader>Delist runs (Scene)</SectionHeader>
        {!delistEvents || delistEvents.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No delist runs logged yet.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Branch</Th>
                <Th>Listed</Th>
                <Th>Delisted</Th>
                <Th>Duration</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {delistEvents.map((row, i) => {
                const p = row.payload as DelistRunPayload;
                return (
                  <Tr key={i}>
                    <Td>{timeAgo(row.occurred_at)}</Td>
                    <Td>{p.branch}</Td>
                    <Td>{p.listed}</Td>
                    <Td>{p.delisted}</Td>
                    <Td>{(p.duration_ms / 1000).toFixed(1)}s</Td>
                    <Td>
                      {p.error ? (
                        <span style={{ color: 'var(--error-ink)' }}>{p.error.slice(0, 60)}</span>
                      ) : (
                        <span style={{ color: 'var(--ok-ink)' }}>ok</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <SectionHeader>Poll runs</SectionHeader>
        {!pollEvents || pollEvents.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No poll runs logged yet.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Checked</Th>
                <Th>Notified</Th>
                <Th>Pair errors</Th>
                <Th>Duration</Th>
              </tr>
            </thead>
            <tbody>
              {pollEvents.map((row, i) => {
                const p = row.payload as PollRunPayload;
                return (
                  <Tr key={i}>
                    <Td>{timeAgo(row.occurred_at)}</Td>
                    <Td>{p.checked}</Td>
                    <Td>{p.notified}</Td>
                    <Td>
                      {p.pair_errors > 0 ? (
                        <span style={{ color: 'var(--error-ink)' }}>{p.pair_errors}</span>
                      ) : (
                        '0'
                      )}
                    </Td>
                    <Td>{(p.duration_ms / 1000).toFixed(1)}s</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </AdminPageShell>
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
