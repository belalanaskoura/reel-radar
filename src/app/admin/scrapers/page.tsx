import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

type ScrapeRunPayload = {
  source: 'scene' | 'vox';
  branch: string;
  listed: number;
  bookable: number;
  delisted: number;
  duration_ms: number;
  error: string | null;
};

type PollRunPayload = {
  checked: number;
  notified: number;
  pair_errors: number;
  duration_ms: number;
};

export default async function AdminScrapersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const supabase = createServiceRoleClient();

  const [{ data: branches }, { data: scrapeEvents }, { data: pollEvents }] = await Promise.all([
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
  ]);

  const scrapeRows = (scrapeEvents ?? [])
    .filter((row) => !branch || (row.payload as ScrapeRunPayload).branch === branch)
    .slice(0, 30);

  return (
    <AdminPageShell title="Scrapers">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Scrape runs
          </h2>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            <BranchLink label="All" active={!branch} href="/admin/scrapers" />
            {(branches ?? []).map((b) => (
              <BranchLink key={b.id} label={b.name} active={branch === b.id} href={`/admin/scrapers?branch=${b.id}`} />
            ))}
          </div>
        </div>

        {scrapeRows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No scrape runs logged yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border" style={{ borderColor: 'var(--rule)' }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}>
                  <Th>When</Th>
                  <Th>Branch</Th>
                  <Th>Listed</Th>
                  <Th>Bookable</Th>
                  <Th>Delisted</Th>
                  <Th>Duration</Th>
                  <Th>Error</Th>
                </tr>
              </thead>
              <tbody>
                {scrapeRows.map((row, i) => {
                  const p = row.payload as ScrapeRunPayload;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                      <Td>{timeAgo(row.occurred_at)}</Td>
                      <Td>
                        {p.source} / {p.branch}
                      </Td>
                      <Td>{p.listed}</Td>
                      <Td>{p.bookable}</Td>
                      <Td>{p.delisted}</Td>
                      <Td>{(p.duration_ms / 1000).toFixed(1)}s</Td>
                      <Td>
                        {p.error ? (
                          <span style={{ color: 'var(--error-ink)' }}>{p.error.slice(0, 60)}</span>
                        ) : (
                          <span style={{ color: 'var(--ok-ink)' }}>ok</span>
                        )}
                      </Td>
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
          Poll runs
        </h2>
        {!pollEvents || pollEvents.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No poll runs logged yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border" style={{ borderColor: 'var(--rule)' }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}>
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
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--rule)' }}>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}

function BranchLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors"
      style={
        active
          ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
          : { background: 'var(--bg-elevated)', color: 'var(--ink)' }
      }
    >
      {label}
    </Link>
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
