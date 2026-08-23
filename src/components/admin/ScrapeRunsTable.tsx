'use client';

import { useMemo, useState } from 'react';
import { SectionHeader } from '@/components/admin/SectionHeader';

export interface ScrapeRunPayload {
  source: 'scene' | 'vox';
  branch: string;
  listed: number;
  bookable: number;
  delisted: number;
  duration_ms: number;
  error: string | null;
  batchSize?: number;
  offset?: number;
}

export interface ScrapeEventRow {
  occurred_at: string;
  payload: ScrapeRunPayload;
}

// The branch filter used to be a real URL param (?branch=), which meant
// every click re-ran this page's full server-side query set (branches,
// scrape events, poll events, delist events) even though only the scrape
// events list is actually branch-scoped -- and even that filtering
// already happened in JS after the fetch, never in the query itself. All
// 100 rows are fetched once on page load and filtered client-side here
// instead, so switching branches is instant with zero server round-trip.
export function ScrapeRunsTable({
  branches,
  events,
}: {
  branches: { id: string; name: string }[];
  events: ScrapeEventRow[];
}) {
  const [branch, setBranch] = useState<string | null>(null);

  const scrapeRows = useMemo(
    () => events.filter((row) => !branch || row.payload.branch === branch).slice(0, 30),
    [events, branch],
  );

  return (
    <section>
      <SectionHeader
        action={
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            <BranchPill label="All" active={!branch} onClick={() => setBranch(null)} />
            {branches.map((b) => (
              <BranchPill key={b.id} label={b.name} active={branch === b.id} onClick={() => setBranch(b.id)} />
            ))}
          </div>
        }
      >
        Scrape runs
      </SectionHeader>

      {scrapeRows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          No scrape runs logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Branch</Th>
                <Th>Listed</Th>
                <Th>Batch</Th>
                <Th>Bookable</Th>
                <Th>Delisted</Th>
                <Th>Duration</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {scrapeRows.map((row, i) => {
                const p = row.payload;
                return (
                  <tr key={i} className="admin-table-row rounded-md transition-colors">
                    <Td>{timeAgo(row.occurred_at)}</Td>
                    <Td>
                      {p.source} / {p.branch}
                    </Td>
                    <Td>{p.listed}</Td>
                    <Td>
                      {p.batchSize !== undefined ? (
                        <span style={{ color: 'var(--ink-dim)' }}>
                          {p.offset ?? 0}-{(p.offset ?? 0) + p.batchSize}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-dim)' }}>-</span>
                      )}
                    </Td>
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
  );
}

function BranchPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors"
      style={
        active
          ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
          : { background: 'var(--bg-elevated)', color: 'var(--ink)' }
      }
    >
      {label}
    </button>
  );
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
